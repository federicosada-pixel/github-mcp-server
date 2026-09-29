# Desktop Cleanup Agent for macOS

This project provides a dependency-free Python script that safely organizes a Mac user's Desktop by moving only the requested item types:

* `.mp4` files to `~/Movies`
* JPEG and RAW image files to `~/Pictures`
* The `Documents` folder, music files, and clearly music-related folders to `~/Music`

The script starts in dry-run mode, prints every planned move, and only makes changes when you re-run it with `--apply`.

## Safety guarantees

* Does not delete files.
* Does not overwrite files. If a destination already exists, the moved item gets a safe suffix such as `Vacation (1).mp4`.
* Preserves Desktop-relative folder hierarchy. For example, `~/Desktop/Trips/Hawaii/beach.mp4` becomes `~/Movies/Trips/Hawaii/beach.mp4`.
* Skips symbolic links to avoid moving unexpected targets.
* Leaves unmatched files untouched.
* Runs as the current user; `sudo` is not required.

## Requirements

* macOS
* Python 3, which is available on current macOS systems or through Apple's Command Line Tools

No third-party Python packages are required.

## macOS permissions

When run from Terminal, macOS may ask for permission to access the Desktop, Movies, Pictures, or Music folders. Allow access when prompted.

If macOS blocks access without showing a prompt:

1. Open System Settings.
2. Go to Privacy & Security.
3. Open Files and Folders or Full Disk Access.
4. Enable access for the app you use to run the script, such as Terminal, iTerm2, or Cursor.

## How to run

From this directory:

```bash
python3 clean_desktop_agent.py
```

Review the dry-run output carefully. If it looks correct, apply the moves:

```bash
python3 clean_desktop_agent.py --apply
```

Show skipped symlinks or unsafe paths:

```bash
python3 clean_desktop_agent.py --show-skips
```

Use custom paths if needed:

```bash
python3 clean_desktop_agent.py \
  --desktop "$HOME/Desktop" \
  --movies "$HOME/Movies" \
  --pictures "$HOME/Pictures" \
  --music "$HOME/Music"
```

## Safety checklist before using `--apply`

* Run the script once without `--apply`.
* Confirm every planned source path is on your Desktop.
* Confirm every planned destination is `~/Movies`, `~/Pictures`, or `~/Music`.
* Confirm there are no unexpected folders in the dry-run output.
* Back up important Desktop files with Time Machine, iCloud Drive, or an external drive.
* Make sure Terminal/Cursor has macOS permission to access Desktop and the destination folders.

## What counts as a match

### Movies

* `.mp4`

### Pictures

* JPEG: `.jpg`, `.jpeg`, `.jpe`
* RAW: `.3fr`, `.arw`, `.cr2`, `.cr3`, `.dcr`, `.dng`, `.erf`, `.fff`, `.iiq`, `.kdc`, `.mos`, `.mrw`, `.nef`, `.nrw`, `.orf`, `.pef`, `.raf`, `.raw`, `.rw2`, `.rwl`, `.sr2`, `.srf`, `.x3f`

### Music

* Audio files: `.aac`, `.aif`, `.aiff`, `.alac`, `.flac`, `.m4a`, `.mid`, `.midi`, `.mp3`, `.oga`, `.ogg`, `.opus`, `.wav`, `.wma`
* Music project files/folders: `.aup`, `.aup3`, `.band`, `.logic`, `.logicx`
* Any folder named `Documents`
* Folders named `Music`, `Audio`, `Songs`, `Albums`, `Tracks`, `Recordings`, `iTunes`, or `GarageBand`
* Folders whose visible files are all music or music project files

## Run tests

```bash
python3 -m unittest
```
