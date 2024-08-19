# Cloud Tomography Visualization

This repository contains code and resources for the cloud tomography visualization work I am doing for Mark Richardson and Linda Forster. The primary components will be:
* A Python script for converting netCDF files into gltf 2.0 3D models.
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
After pip installing the module, a script called `nc2gltf` will be added to your path. The usage for this tool is as follows:
```
usage: nc2gltf [-h] [-o FILE] FILE

positional arguments:
  FILE                  input file in netCDF (.nc) format, the QC variable is required

options:
  -h, --help            show this help message and exit
  -o FILE, --outfile FILE
                        path to an output file to use instead of the default, which would be the same name as the input file, but with the .glb extension. The .gltf extension is also allowed, but all vertex data will be saved to a separate vertices.bin file.
```

Javascript application:
```bash
npm run dev
```

## Other notes

The equirectangular map texture is an AVIF-encoded image originally derived from a .exr HDRI tonemapping file.

File source: [https://polyhaven.com/a/qwantani_puresky](https://polyhaven.com/a/qwantani_puresky)

AVIF encoding settings (YUV 444 is implied): `avifenc --min 0 --max 63 -a end-usage=q -a cq-level=28 -a tune=ssim --speed 3 static/qwantani_puresky_4k.png static/qwantani_puresky_4k.avif`

