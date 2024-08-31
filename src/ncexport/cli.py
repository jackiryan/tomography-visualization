"""CLI frontend for converting netCDF to gltf or nrrd."""

import argparse
import pathlib

from . import convert, radiance


def sanitize_inpath(
    inpath: pathlib.Path, parser: argparse.ArgumentParser
) -> pathlib.Path:
    try:
        inpath = inpath.expanduser().resolve()
    except RuntimeError:
        parser.error("could not resolve input filepath")
    # Check that the input file is a netCDF file. Only the .nc extension is allowed
    if not inpath.is_file() or inpath.suffix.lower() != ".nc":
        parser.error("provided input is not a netCDF format file")
    return inpath


def sanitize_outpath(
    outpath: pathlib.Path,
    inpath: pathlib.Path,
    parser: argparse.ArgumentParser,
    extensions: list[str],
) -> pathlib.Path:
    try:
        outpath = outpath.expanduser().resolve()
    except AttributeError:
        # if args.outfile is None
        in_parentpath = pathlib.PurePath(inpath).parent
        outpath = pathlib.Path(in_parentpath.joinpath(inpath.stem + extensions[0]))
    except RuntimeError:
        parser.error("could not resolve output path")
    if outpath.is_dir():
        # create a file with the same name as the input netCDF in the specified
        # directory if the output is not a filename
        outpath = outpath / (inpath.stem + extensions[0])
    elif outpath.suffix.lower() not in extensions:
        parser.error(
            f"outfile must be either a {'/'.join(extensions)} filepath or a directory"
        )
    return outpath


def process_file(
    args: argparse.Namespace, parser: argparse.ArgumentParser, is_nrrd: bool = False
) -> None:
    """Perform basic checks on filepath arguments before calling convert_nc_gltf
    or convert_nc_nrrd function."""
    inpath = sanitize_inpath(args.file, parser)

    if is_nrrd:
        extensions = [".nrrd"]
    else:
        extensions = [".glb", ".gltf"]

    outpath = sanitize_outpath(args.outfile, inpath, parser, extensions)

    # This is more or less the same as sanitize outpath, but it's not worth my time
    # to fully refactor
    try:
        respath = args.resource.expanduser().resolve()
    except AttributeError:
        out_parentpath = pathlib.PurePath(outpath).parent
        respath = pathlib.Path(out_parentpath.joinpath(outpath.stem + ".bin"))
    except RuntimeError:
        parser.error("could not resolve resource path")

    use_var = args.variable or "QC"

    # Setting this value, which must be an int, to an arbitrary value tells the
    # quantization function in convert.py to interpret the data as a float
    bits = 32
    type_str = f"float{bits}"
    if args.bits is not None:
        if args.bits == 8 or args.bits == 16:
            bits = args.bits
            type_str = f"uint{bits}"
        else:
            parser.error("only 8 or 16 bits are allowed for quantizing data")

    print(f"input filepath   : {inpath}")
    print(f"output filepath  : {outpath}")
    print(f"exported variable: {use_var}")

    if is_nrrd:
        print(f"quantization     : {type_str}")
        print("\nExporting data to NRRD...")
        convert.convert_nc_nrrd(inpath, outpath, use_var, bits)
    else:
        if outpath.suffix == ".gltf":
            print(f"vertices filepath: {respath}")
        print(f"\nExporting data to {outpath.suffix.upper().lstrip('.')}...")
        convert.convert_nc_gltf(inpath, outpath, respath, use_var)


def process_file_rad(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    inpath = sanitize_inpath(args.file, parser)
    extensions = [".png", ".jpg"]
    outpath = sanitize_outpath(args.outfile, inpath, parser, extensions)

    use_var = args.variable or "rad"

    print(f"input filepath   : {inpath}")
    print(f"output filepath  : {outpath}")
    print(f"exported variable: {use_var}")

    radiance.export_radiance_image(inpath, outpath, use_var)


def get_parser(is_nrrd: bool = False) -> argparse.ArgumentParser:
    """Return argument parser."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "file",
        type=pathlib.Path,
        metavar="FILE",
        help="input file in netCDF (.nc) format, the QC variable is required",
    )
    if is_nrrd:
        outfile_help = (
            "path to an output file to use instead of the default, which would"
            + " be the same name as the input file, but with the .nrrd extension"
        )
    else:
        outfile_help = (
            "path to an output file to use instead of the default, which would"
            + " be the same name as the input file, but with the .glb extension"
        )
    parser.add_argument(
        "-o",
        "--outfile",
        type=pathlib.Path,
        metavar="FILE",
        help=outfile_help,
    )
    parser.add_argument(
        "-v",
        "--variable",
        type=str,
        help=(
            "optionally specify the variable name to convert to a point cloud."
            " default is QC"
        ),
    )
    if is_nrrd:
        parser.add_argument(
            "-b",
            "--bits",
            type=int,
            help=(
                "Bits of precision to quantize variable data. Accepted values "
                "are 8 or 16 [bits]. If not provided, exports NRRD as float."
            ),
        )
    else:
        parser.add_argument(
            "-r",
            "--resource",
            type=pathlib.Path,
            metavar="FILE",
            help=(
                "specify resource name (vertices binary file) if exporting to gltf."
                " default is the same name as the model but with .bin extension"
            ),
        )
    return parser


def get_parser_rad() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "file",
        type=pathlib.Path,
        metavar="FILE",
        help="input file in netCDF (.nc) format, the rad variable is required",
    )
    parser.add_argument(
        "-o",
        "--outfile",
        type=pathlib.Path,
        metavar="FILE",
        help=(
            "path to an output file to use instead of the default, which would "
            "be the same name as the input file, but with the .png extension"
        ),
    )
    parser.add_argument(
        "-v",
        "--variable",
        type=str,
        help=(
            "optionally specify the variable name to convert to an image."
            " default is rad"
        ),
    )
    return parser


def main() -> None:
    """Process config and CLI arguments then initiate processing."""
    parser = get_parser()
    args = parser.parse_args()
    args.bits = None

    process_file(args, parser)


def main_nrrd() -> None:
    """Process config and CLI arguments to create an NRRD then initiate processing."""
    parser = get_parser(is_nrrd=True)
    args = parser.parse_args()

    process_file(args, parser, is_nrrd=True)


def main_rad() -> None:
    parser = get_parser_rad()
    args = parser.parse_args()

    process_file_rad(args, parser)
