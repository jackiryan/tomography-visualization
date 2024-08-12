import gltflib
import netCDF4
import numpy as np
import open3d as o3d
import pathlib


def create_gltf_model(
    modelpath: pathlib.Path, pointarray: np.ndarray, resource: str = "vertices.bin"
) -> None:
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
            gltflib.BufferView(buffer=0, byteOffset=0, byteLength=len(vertex_data))
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


def create_vertex_buffer(vertices: np.ndarray) -> bytes:
    return vertices.astype(np.float32).flatten().tobytes()


def get_nonzero_points(qcvar: netCDF4.Variable) -> np.ndarray:
    nonzero_indices = np.nonzero(qcvar[:])
    return np.stack(nonzero_indices, axis=-1)


def rotate_points(points: np.ndarray) -> np.ndarray:
    return np.column_stack((points[:, 0], points[:, 2], -points[:, 1]))


def convert_nc_gltf(
    nc_file: pathlib.Path, gltf_file: pathlib.Path, variable: str = "QC"
) -> bool:
    rootgrp = netCDF4.Dataset(nc_file, "r")
    # Raises KeyError if QC is not present in the netCDF
    qcvar = rootgrp.variables[variable]
    nonzero_points = get_nonzero_points(qcvar)
    points = rotate_points(nonzero_points)
    create_gltf_model(gltf_file, points)
    # pointcloud_to_mesh(gltf_file, points)
    return True


def pointcloud_to_mesh(mesh_file: pathlib.Path, points: np.ndarray) -> bool:
    print("Creating point cloud using open3d")
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
