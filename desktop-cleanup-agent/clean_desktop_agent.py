#!/usr/bin/env python3
"""Safely organize a macOS Desktop by moving requested item types into
~/Movies, ~/Pictures, and ~/Music.

Dry-run by default; pass --apply to actually move files. No third-party
dependencies are required.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

MOVIE_EXTENSIONS = {".mp4"}

JPEG_EXTENSIONS = {".jpg", ".jpeg", ".jpe"}

RAW_EXTENSIONS = {
    ".3fr", ".arw", ".cr2", ".cr3", ".dcr", ".dng", ".erf", ".fff", ".iiq",
    ".kdc", ".mos", ".mrw", ".nef", ".nrw", ".orf", ".pef", ".raf", ".raw",
    ".rw2", ".rwl", ".sr2", ".srf", ".x3f",
}

PICTURE_EXTENSIONS = JPEG_EXTENSIONS | RAW_EXTENSIONS

AUDIO_EXTENSIONS = {
    ".aac", ".aif", ".aiff", ".alac", ".flac", ".m4a", ".mid", ".midi",
    ".mp3", ".oga", ".ogg", ".opus", ".wav", ".wma",
}

MUSIC_PROJECT_EXTENSIONS = {".aup", ".aup3", ".band", ".logic", ".logicx"}

MUSIC_EXTENSIONS = AUDIO_EXTENSIONS | MUSIC_PROJECT_EXTENSIONS

MUSIC_FOLDER_NAMES = {
    "music", "audio", "songs", "albums", "tracks", "recordings", "itunes",
    "garageband",
}

DOCUMENTS_FOLDER_NAME = "documents"


class Plan:
    """A single planned move."""

    def __init__(self, src: Path, dest: Path, kind: str):
        self.src = src
        self.dest = dest
        self.kind = kind  # "file" or "dir"


class Skip:
    """A path that was intentionally left alone."""

    def __init__(self, path: Path, reason: str):
        self.path = path
        self.reason = reason


def unique_destination(dest: Path) -> Path:
    """Return `dest`, or a sibling with a safe numeric suffix if it exists."""
    if not dest.exists() and not dest.is_symlink():
        return dest

    stem, suffix = dest.stem, dest.suffix
    parent = dest.parent
    counter = 1
    while True:
        candidate = parent / f"{stem} ({counter}){suffix}"
        if not candidate.exists() and not candidate.is_symlink():
            return candidate
        counter += 1


def visible_entries(directory: Path):
    return [p for p in directory.iterdir() if not p.name.startswith(".")]


def is_music_only_folder(directory: Path) -> bool:
    """True if every visible entry in `directory` is a file matching a
    music extension (folder contains no subdirectories)."""
    entries = visible_entries(directory)
    if not entries:
        return False
    for entry in entries:
        if entry.is_symlink():
            return False
        if entry.is_dir():
            return False
        if entry.suffix.lower() not in MUSIC_EXTENSIONS:
            return False
    return True


def classify_directory(directory: Path):
    """Return "music" if this whole directory should be moved to Music,
    otherwise None (meaning: recurse into it)."""
    name = directory.name
    if name.lower() == DOCUMENTS_FOLDER_NAME:
        return "music"
    if name.lower() in MUSIC_FOLDER_NAMES:
        return "music"
    if is_music_only_folder(directory):
        return "music"
    return None


def classify_file(path: Path):
    """Return one of "movies", "pictures", "music", or None."""
    ext = path.suffix.lower()
    if ext in MOVIE_EXTENSIONS:
        return "movies"
    if ext in PICTURE_EXTENSIONS:
        return "pictures"
    if ext in MUSIC_EXTENSIONS:
        return "music"
    return None


def build_plan(desktop: Path, movies: Path, pictures: Path, music: Path):
    plans = []
    skips = []

    dest_roots = {"movies": movies, "pictures": pictures, "music": music}

    def walk(directory: Path, rel: Path):
        for entry in sorted(directory.iterdir(), key=lambda p: p.name):
            entry_rel = rel / entry.name

            if entry.is_symlink():
                skips.append(Skip(entry, "symlink"))
                continue

            if entry.is_dir():
                category = classify_directory(entry)
                if category is not None:
                    dest = dest_roots[category] / entry_rel
                    plans.append(Plan(entry, unique_destination(dest), "dir"))
                else:
                    walk(entry, entry_rel)
                continue

            category = classify_file(entry)
            if category is None:
                continue
            dest = dest_roots[category] / entry_rel
            plans.append(Plan(entry, unique_destination(dest), "file"))

    walk(desktop, Path("."))
    return plans, skips


def apply_plan(plans):
    for plan in plans:
        plan.dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(plan.src), str(plan.dest))


def print_plan(plans, apply_mode: bool):
    if not plans:
        print("Nothing to move.")
        return
    prefix = "Moved" if apply_mode else "[DRY RUN] Would move"
    for plan in plans:
        print(f"{prefix}: {plan.src} -> {plan.dest}")


def print_skips(skips):
    if not skips:
        print("No skipped items.")
        return
    for skip in skips:
        print(f"Skipped ({skip.reason}): {skip.path}")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Organize a macOS Desktop into Movies, Pictures, and Music."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually move files. Without this flag, only a dry run is printed.",
    )
    parser.add_argument(
        "--show-skips",
        action="store_true",
        help="Show skipped symlinks or unsafe paths.",
    )
    parser.add_argument(
        "--desktop", default=str(Path.home() / "Desktop"), help="Desktop path."
    )
    parser.add_argument(
        "--movies", default=str(Path.home() / "Movies"), help="Movies destination."
    )
    parser.add_argument(
        "--pictures",
        default=str(Path.home() / "Pictures"),
        help="Pictures destination.",
    )
    parser.add_argument(
        "--music", default=str(Path.home() / "Music"), help="Music destination."
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    desktop = Path(args.desktop).expanduser()
    movies = Path(args.movies).expanduser()
    pictures = Path(args.pictures).expanduser()
    music = Path(args.music).expanduser()

    if not desktop.is_dir():
        print(f"Desktop path does not exist or is not a directory: {desktop}", file=sys.stderr)
        return 1

    plans, skips = build_plan(desktop, movies, pictures, music)

    print_plan(plans, args.apply)
    if args.show_skips:
        print_skips(skips)

    if args.apply:
        apply_plan(plans)

    return 0


if __name__ == "__main__":
    sys.exit(main())
