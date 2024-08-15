"""CLI frontend for converting netCDF to gltf."""

import argparse
import pathlib

from . import convert


def process_file(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    """Perform basic checks on filepath arguments before calling convert_nc_gltf
    function."""
    try:
        inpath = args.file.expanduser().resolve()
    except RuntimeError:
        parser.error("could not resolve input filepath")
    # Check that the input file is a netCDF file. Only the .nc extension is allowed
    if not inpath.is_file() or inpath.suffix.lower() != ".nc":
        parser.error("provided input is not a netCDF format file")
    try:
        outpath: pathlib.Path = args.outfile.expanduser().resolve()
    except AttributeError:
        # if args.outfile is None
        parentpath = pathlib.PurePath(inpath).parent
        outpath = pathlib.Path(parentpath.joinpath(inpath.stem + ".glb"))
    except RuntimeError:
        parser.error("could not resolve output path")
    if outpath.is_dir():
        # create a file with the same name as the input netCDF in the specified directory
        # if the output is not a filename
        outpath = outpath / (inpath.stem + ".glb")
    elif outpath.suffix.lower() not in [".glb", ".gltf"]:
        parser.error("outfile must be either a .glb/.gltf filepath or a directory")

    use_var = args.variable or "QC"

    convert.convert_nc_gltf(inpath, outpath, use_var)


def get_parser() -> argparse.ArgumentParser:
    """Return argument parser."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "file",
        type=pathlib.Path,
        metavar="FILE",
        help="input file in netCDF (.nc) format, the QC variable is required",
    )
    parser.add_argument(
        "-o",
        "--outfile",
        type=pathlib.Path,
        metavar="FILE",
        help=(
            "path to an output file to use instead of the default, which would be "
            "the same name as the input file, but with the .glb extension"
        ),
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
