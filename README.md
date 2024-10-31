# Cloud Tomography Visualization

This repository contains code and resources for the cloud tomography visualization work I am doing for Mark Richardson and Linda Forster. The primary components will be:
* A Python script for converting netCDF files into various formats needed for visualization.
* A three.JS web application for visualizing said models.
* Any additional resources needed for this project.

The source netCDF data is not included in this repository as each .nc file is over 700MB.

## Installation (dev only currently)
Python script:
```bash
python3 -m venv tomo_venv
source tomo_venv/bin/activate
python3 -m pip install -e .
```

Javascript application:
```bash
npm install
```

## Usage

### Python scripts
After pip installing the module, three scripts will be added to your path. The first one, `nc2gltf`, can be used to convert a tomography netCDF file into a 3-D point cloud via its cloud-water mixing ratio data. This file can be viewed in blender, but does not preserve any information about the value contained in the point and cannot be directly colormapped. The usage for this tool is as follows:
```
usage: nc2gltf [-h] [-o FILE] [-v VARIABLE] [-r FILE] FILE

positional arguments:
  FILE                  input file in netCDF (.nc) format, the QC variable is required

options:
  -h, --help            show this help message and exit
  -o FILE, --outfile FILE
                        path to an output file to use instead of the default, which would be the same name as the input file, but with the .glb extension
  -v VARIABLE, --variable VARIABLE
                        optionally specify the variable name to convert to a point cloud. default is QC
  -r FILE, --resource FILE
                        specify resource name (vertices binary file) if exporting to gltf. default is the same name as the model but with .bin extension
```

### Generating the high-resolution point cloud file for the visualization

The files `RICO_40m_80kmx80km_QC.gltf` and `RICO_40m_80kmx80km_QC.bin` are required to run the visualization component of this repo. To generate them with nc2gltf, you will need the source netcdf file and then you will need to run this command in the top level directory of this repo:
```
nc2gltf /path/to/RICO_40m_80kmx80km_T_qc_10.5h.nc -o static/RICO_40m_80kmx80km_QC.gltf
```

### NRRD generation (Rendering still WIP)

The second tool, `nc2nrrd`, converts a tomography netCDF file into a 3-D raster that can be used for volumetric rendering. While this file cannot be viewed directly in a tool like Blender, the Javascript viewer application in this repo allows for loading and visualizing these files. Eventually, colormapping support will be added as well. The usage for this tool is as follows:
```
usage: nc2nrrd [-h] [-o FILE] [-v VARIABLE] [-b BITS] FILE

positional arguments:
  FILE                  input file in netCDF (.nc) format, the QC variable is required

options:
  -h, --help            show this help message and exit
  -o FILE, --outfile FILE
                        path to an output file to use instead of the default, which would be the same name as the input file, but with the .nrrd extension
  -v VARIABLE, --variable VARIABLE
                        optionally specify the variable name to convert to a point cloud. default is QC
  -b BITS, --bits BITS  Bits of precision to quantize variable data. Accepted values are 8 or 16 [bits]. If not provided, exports NRRD as float.
```

The third tool, `ncradiance`, is intended to export radiance data from MISR netCDF files. At this time, there are limited options.
```
usage: ncradiance [-h] [-o FILE] [-v VARIABLE] FILE

positional arguments:
  FILE                  input file in netCDF (.nc) format, the rad variable is required

options:
  -h, --help            show this help message and exit
  -o FILE, --outfile FILE
                        path to an output file to use instead of the default, which would be the same name as the input file, but with the .png extension
  -v VARIABLE, --variable VARIABLE
                        optionally specify the variable name to convert to an image. default is rad
```

### Javascript application

In a spare terminal tab (this command will run continuously until you press <kbd>Ctrl</kbd> + <kbd>C</kbd>), run the following command while in the top-level directory of this repository:
```bash
npm run dev
```
If you lose the tab containing the viewer, it can be found at [localhost:5173](http://localhost:5173/). If you get a message from your browser that says "This site can't be reached" be sure you still have the `npm run dev` command running in a terminal tab.

## Other notes

The equirectangular map textures are AVIF-encoded image originally derived from .exr HDRI tonemapping files.

Cloud file source: [https://polyhaven.com/a/qwantani_puresky](https://polyhaven.com/a/qwantani_puresky)

Star map file source: [https://svs.gsfc.nasa.gov/4851](https://svs.gsfc.nasa.gov/4851)

AVIF encoding settings (YUV 444 is implied): `avifenc --min 0 --max 63 -a end-usage=q -a cq-level=28 -a tune=ssim --speed 3 static/qwantani_puresky_4k.png static/qwantani_puresky_4k.avif`

AVIF encoding settings for starmap: `avifenc --min 0 --max 63 -a end-usage=q -a cq-level=32 -a tune=ssim --speed 3 static/starmap_2020_4k.png static/starmap_2020_4k.avif`

