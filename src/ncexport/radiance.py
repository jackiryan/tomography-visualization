'''
APACHE LICENSE, VERSION 2.0
Copyright (c) 2023-25 California Institute of Technology (“Caltech”).
U.S. Government sponsorship acknowledged.

All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this list of
   conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list
   of conditions and the following disclaimer in the documentation and/or other
   materials provided with the distribution.
3. Neither the name of Caltech nor its operating division, the Jet Propulsion
   Laboratory, nor the names of its contributors may be used to endorse or promote
   products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
'''
import matplotlib as mpl
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
    colormap = mpl.colormaps["Blues_r"]
    cm_imgarr = colormap(imgarr / float(levels))

    radimg = Image.fromarray((cm_imgarr[:, :, :3] * levels).astype(np.uint8))
    radimg.save(image_file)
    return True
