import gltflib
import netCDF4
import nrrd
import numpy as np
import numpy.typing as npt
import pathlib

# Open3D dependency removed until further notice
# import open3d as o3d


def create_gltf_model(
    modelpath: pathlib.Path,
    pointarray: npt.NDArray[np.int_],
    resource: str = "vertices.bin",
) -> None:
    """
    Create a glb or gltf format 3D object from the provided array of points. The
    resource file argument, if provided, is a binary file that will be created by
    the gltf module to store the vertex data (only used when exporting as gltf).

    :param modelpath: output filepath to store the glb/gltf model
    :param pointarray: numpy array of vertices
    :param resource: optionally specify binary output file when exporting gltf
    :returns: none, side effect: a glb or gltf format file (and optionally .bin file)
    are saved at the specified location(s)
    """
    vertex_data = create_vertex_buffer(pointarray)
    model = gltflib.GLTFModel(
        asset=gltflib.Asset(version="2.0"),
        scenes=[gltflib.Scene(nodes=[0])],
        nodes=[gltflib.Node(mesh=0)],
        meshes=[
            gltflib.Mesh(
                primitives=[
                    gltflib.Primitive(
                        attributes=gltflib.Attributes(POSITION=0),
                        mode=0,  # mode 0 corresponds to POINTS
                    )
                ]
            )
        ],
        buffers=[gltflib.Buffer(byteLength=len(vertex_data), uri=resource)],
        bufferViews=[
            gltflib.BufferView(
                buffer=0,
                byteOffset=0,
                byteLength=len(vertex_data),
                target=gltflib.BufferTarget.ARRAY_BUFFER.value,
            )
        ],
        accessors=[
            gltflib.Accessor(
                bufferView=0,
                byteOffset=0,
                componentType=gltflib.ComponentType.FLOAT.value,
                count=len(pointarray),
                type=gltflib.AccessorType.VEC3.value,
                min=pointarray.min(axis=0).tolist(),
                max=pointarray.max(axis=0).tolist(),
            )
        ],
    )

    file_resource = gltflib.gltf_resource.FileResource(resource, data=vertex_data)
    gltf = gltflib.gltf.GLTF(model=model, resources=[file_resource])
    gltf.export(str(modelpath))


def create_vertex_buffer(vertices: npt.NDArray[np.int_]) -> bytes:
    """flattens array of vertices to a buffer of bytes"""
    return vertices.astype(np.float32).flatten().tobytes()


def get_nonzero_points(qcvar: netCDF4.Variable) -> npt.NDArray[np.int_]:
    """
    Determines the 3-dimensional index of each non-zero point in the provided netCDF
    variable. Input dimensions should be X-by-Y-by-Z and output dimensions will be an
    N-by-3 where each point is an [x,y,z] coordinate and N is the number of non-zero
    points.
    :params qcvar: netcdf4 variable to parse
    :returns: numpy ndarray containing the indices of all non-zero points as [x, y, z]
    """
    nonzero_indices = np.nonzero(qcvar[:])
    return np.stack(nonzero_indices, axis=-1)


def rotate_points(points: npt.NDArray[np.int_]) -> npt.NDArray[np.int_]:
    """rotates all points in an Nx3 array by -pi/2 about the x axis"""
    return np.column_stack((points[:, 0], points[:, 2], -points[:, 1]))


def quantize(
    u: np.float_, minu: np.float_, maxu: np.float_, levels: int
) -> np.uint8 | np.uint16:
    """quantize a floating point value between a min and max over N levels"""
    rangeu = maxu - minu
    dt = np.uint8 if (levels == 255) else np.uint16
    return dt((u - minu) / rangeu * levels)


def quantize_float(
    u: np.float_, minu: np.float_, maxu: np.float_, levels: int
) -> np.float32:
    """idempotent function with the same signature as quantize, used when exporting
    netCDF data as floating point."""
    return np.float32(u)


def map_points_nrrd(
    nz_points: npt.NDArray[np.int_], vardata: netCDF4.Variable, quantization_bits: int
) -> npt.NDArray[np.uint8 | np.uint16 | np.float32]:
    """
    Convert values in the input netCDF variable to quantized values. If
    quantization_bits is not 8 (byte) or 16 ("half float" in threejs terminology),
    then the data values will be represented as floats. Also rotates points by
    -pi / 2 over the x axis to match y-axis up convention of three.js

    :param nz_points: the indices of non-zero data values. This is intended
    to allow for more efficient data packing by only storing the vertical slices
    containing non-zero data.
    :param vardata: netCDF variable to read values from
    :param quantization_bits: export data as 8- or 16-bit values, otherwise as float
    :returns: numpy ndarray with the data as the type specified by quantization_bits
    """
    base_shape = vardata.shape

    # The output coordinate space has y up, so denote the z dimension of the input data
    # as a y dimension for the output point cloud
    min_y = np.min(nz_points[:, 2])
    max_y = np.max(nz_points[:, 2])
    # Currently discarding this value due to an as yet unsolved issue with the shader
    y_shape = max_y - min_y

    min_val: np.float_ = np.min(vardata[:])
    max_val: np.float_ = np.max(vardata[:])
    levels: int = (2 ** (quantization_bits)) - 1
    if quantization_bits == 8:
        dt = np.uint8
        quant_fn = quantize
    elif quantization_bits == 16:
        dt = np.uint16
        quant_fn = quantize
    else:
        dt = np.float32
        quant_fn = quantize_float
    # The NRRD file will occupy a cube with the dimensions of the xy plane from the
    # original data. The y height is set this way to get it to work with the
    # volumetric shader. TO DO: Modify the shader to allow more efficient data packing
    points = np.zeros((base_shape[0], base_shape[0], base_shape[1]), dtype=dt)
    for pt in nz_points:
        in_x = pt[0]
        in_y = pt[1]
        in_z = pt[2]
        x = pt[0]
        y = pt[2] - min_y - 1
        z = base_shape[1] - pt[1] - 1
        points[x][y][z] = quant_fn(vardata[in_x][in_y][in_z], min_val, max_val, levels)
    return points


def create_nrrd_model(
    nrrd_file: pathlib.Path,
    points: npt.NDArray[np.uint8 | np.uint16 | np.float32],
    min_y: int,
) -> None:
    """exports a numpy array to NRRD"""
    # Append the y offset to the filename
    print(f"Y offset: {min_y} meters")
    # new_name = nrrd_file.stem + f"_{min_y}m" + nrrd_file.suffix
    # outpath = str(nrrd_file.with_name(new_name))

    # No need to append y offset to filename since data is not effciently
    # packed at this time
    outpath = str(nrrd_file)
    nrrd.write(outpath, points)


def convert_nc_gltf(
    nc_file: pathlib.Path,
    gltf_file: pathlib.Path,
    res_file: pathlib.Path,
    variable: str = "QC",
) -> bool:
    """
    Main function for converting a netCDF dataset into a glb or gltf format point
    cloud. The glb (where vertex data is contained internally in the file) or gltf
    (which creates an ancillary vertices.bin file) format is chosen based on the file
    extension of the output filepath. The cloud water mixing ratio variable, "QC" is
    the default exported variable.

    :params nc_file: netCDF4 file to convert to a 3D object
    :params gltf_file: output filepath, can have glb or gltf extension
    :params res_file: when exporting gltf, vertices are stored in this filepath
    :params variable: the variable to export to a 3D point cloud
    :returns: True if successful
    :raises: KeyError if the variable keyword does not exist in the netCDF database
    """
    rootgrp = netCDF4.Dataset(nc_file, "r")
    # Raises KeyError if QC is not present in the netCDF
    qcvar = rootgrp.variables[variable]

    nonzero_points = get_nonzero_points(qcvar)
    print(f"Found {nonzero_points.shape[0]} points")

    points = rotate_points(nonzero_points)
    create_gltf_model(gltf_file, points, str(res_file.name))
    # pointcloud_to_mesh(gltf_file, points)
    return True


def convert_nc_nrrd(
    nc_file: pathlib.Path,
    nrrd_file: pathlib.Path,
    variable: str = "QC",
    quantization_bits: int = 8,
) -> bool:
    """
    Main function for converting a netCDF dataset into a Near-Raw Raster Data (NRRD)
    format file. The bounding hull of the point cloud is chosen based on the min and
    max z-coordinates where non-zero data appears in the source. Data values are
    scaled and quantized to an 8- or 16-bit range (or float). The cloud water mixing
    ratio variable, "QC" is the default exported variable.

    :params nc_file: netCDF4 file to convert to a 3D object
    :params nrrd_file: output filepath with .nrrd extension
    :params variable: the variable to export to a 3D point cloud
    :params quantization_bits: passed to pre-processing function to quantize float data
    :returns: True if successful
    :raises: KeyError if the variable keyword does not exist in the netCDF database
    """
    rootgrp = netCDF4.Dataset(nc_file, "r")
    qcvar = rootgrp.variables[variable]

    nonzero_points = get_nonzero_points(qcvar)
    print(f"Found {nonzero_points.shape[0]} points")

    # quantization_bits = 32 if exporting data as floating point
    points = map_points_nrrd(nonzero_points, qcvar, quantization_bits)

    # When packing the data, it's important to know where the data starts on the
    # y axis so it can be placed in the scene properly
    min_y = int(np.min(nonzero_points[:, 2]))
    create_nrrd_model(nrrd_file, points, min_y)
    return True


"""
DEPRECATED: Open3D dependency removed until further notice
def pointcloud_to_mesh(mesh_file: pathlib.Path, points: npt.NDArray[np.int_]) -> bool:
    print("Creating mesh from point cloud using open3d")
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=1.1, max_nn=30)
    )
    poisson_mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=8, width=0, scale=1.1, linear_fit=False
    )[0]
    # TO DO: filter point cloud into clusters to create separate hulls for each cloud
    # hull, _ = pcd.compute_convex_hull()
    # print("Visualizing output")
    # o3d.visualization.draw_geometries([poisson_mesh])
    return True
"""
