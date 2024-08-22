"""CLI frontend for converting netCDF to gltf."""

import argparse
import pathlib

from . import convert


def process_file(
    args: argparse.Namespace, parser: argparse.ArgumentParser, is_nrrd: bool = False
) -> None:
    """Perform basic checks on filepath arguments before calling convert_nc_gltf
    or convert_nc_nrrd function."""
    try:
        inpath = args.file.expanduser().resolve()
    except RuntimeError:
        parser.error("could not resolve input filepath")
    # Check that the input file is a netCDF file. Only the .nc extension is allowed
    if not inpath.is_file() or inpath.suffix.lower() != ".nc":
        parser.error("provided input is not a netCDF format file")

    if is_nrrd:
        extensions = [".nrrd"]
    else:
        extensions = [".glb", ".gltf"]

    try:
        outpath = args.outfile.expanduser().resolve()
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
    # parser.add_argument(
    #     "-v",
    #     "--verbose",
    #     action="count",
    #     default=0,
    #     help="increase verbosity level"
    # )
    # parser.add_argument(
    #     "--logfile",
    #     type=pathlib.Path,
    #     help="path to logfile to send output to",
    #     metavar="FILE"
    # )
    return parser


def main() -> None:
    """Process config and CLI arguments then initiate processing."""
    parser = get_parser()
    args = parser.parse_args()

    # if args.logfile is not None and args.logfile.exists():
    #     parser.error("logfile already exists")
    # set_console_logger(args.verbose, args.logfile)

    process_file(args, parser)


def main_nrrd() -> None:
    """Process config and CLI arguments to create an NRRD then initiate processing."""
    parser = get_parser(is_nrrd=True)
    args = parser.parse_args()

    process_file(args, parser, is_nrrd=True)
