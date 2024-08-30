import netCDF4
import numpy as np
import pathlib
from PIL import Image
import numpy.typing as npt

from .convert import quantize


def export_radiance_image(
    nc_file: pathlib.Path, image_file: pathlib.Path, variable: str = "rad"
) -> bool:
    rootgrp = netCDF4.Dataset(nc_file, "r")
    radvar = rootgrp.variables[variable]
    # Always take viewing zenith angle 8 (nadir) for now
    radarr: npt.NDArray[np.float_] = radvar[:, :, 8]
    min_val: np.float_ = np.min(radarr[:])
    max_val: np.float_ = np.max(radarr[:])
    levels = 255

    def quantize_uint8(x):
        return quantize(x, min_val, max_val, levels)

    vec_quantize = np.vectorize(quantize_uint8)
    imgarr: npt.NDArray[np.uint8] = vec_quantize(radarr)
    radimg = Image.fromarray(imgarr)
    radimg.save(image_file)
    return True
