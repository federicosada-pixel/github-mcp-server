import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import clean_desktop_agent as agent


class TempDesktopTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.desktop = self.root / "Desktop"
        self.movies = self.root / "Movies"
        self.pictures = self.root / "Pictures"
        self.music = self.root / "Music"
        self.desktop.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def touch(self, rel_path):
        path = self.desktop / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("data")
        return path

    def run_agent(self, apply=False, show_skips=False):
        argv = [
            "--desktop", str(self.desktop),
            "--movies", str(self.movies),
            "--pictures", str(self.pictures),
            "--music", str(self.music),
        ]
        if apply:
            argv.append("--apply")
        if show_skips:
            argv.append("--show-skips")
        return agent.main(argv)


class ClassificationTests(TempDesktopTestCase):
    def test_dry_run_does_not_move_files(self):
        movie = self.touch("clip.mp4")
        self.run_agent(apply=False)
        self.assertTrue(movie.exists())
        self.assertFalse((self.movies / "clip.mp4").exists())

    def test_apply_moves_mp4_to_movies(self):
        self.touch("clip.mp4")
        self.run_agent(apply=True)
        self.assertTrue((self.movies / "clip.mp4").exists())
        self.assertFalse((self.desktop / "clip.mp4").exists())

    def test_apply_moves_jpeg_and_raw_to_pictures(self):
        self.touch("photo.jpg")
        self.touch("photo.nef")
        self.run_agent(apply=True)
        self.assertTrue((self.pictures / "photo.jpg").exists())
        self.assertTrue((self.pictures / "photo.nef").exists())

    def test_apply_moves_audio_files_to_music(self):
        self.touch("song.mp3")
        self.run_agent(apply=True)
        self.assertTrue((self.music / "song.mp3").exists())

    def test_documents_folder_moves_whole_to_music(self):
        self.touch("Documents/report.txt")
        self.touch("Documents/Sub/notes.txt")
        self.run_agent(apply=True)
        self.assertTrue((self.music / "Documents" / "report.txt").exists())
        self.assertTrue((self.music / "Documents" / "Sub" / "notes.txt").exists())
        self.assertFalse((self.desktop / "Documents").exists())

    def test_named_music_folder_moves_whole(self):
        self.touch("GarageBand/project.txt")
        self.run_agent(apply=True)
        self.assertTrue((self.music / "GarageBand" / "project.txt").exists())

    def test_folder_of_only_music_files_moves_whole(self):
        self.touch("MyBand/track1.mp3")
        self.touch("MyBand/track2.wav")
        self.run_agent(apply=True)
        self.assertTrue((self.music / "MyBand" / "track1.mp3").exists())
        self.assertTrue((self.music / "MyBand" / "track2.wav").exists())

    def test_folder_with_mixed_files_is_not_moved_whole(self):
        self.touch("Mixed/track1.mp3")
        self.touch("Mixed/notes.txt")
        self.run_agent(apply=True)
        # Only the matching file inside should move; folder itself stays.
        self.assertTrue((self.music / "Mixed" / "track1.mp3").exists())
        self.assertTrue((self.desktop / "Mixed" / "notes.txt").exists())
        self.assertFalse((self.desktop / "Mixed" / "track1.mp3").exists())

    def test_unmatched_files_are_left_untouched(self):
        other = self.touch("notes.txt")
        self.run_agent(apply=True)
        self.assertTrue(other.exists())

    def test_desktop_relative_hierarchy_is_preserved(self):
        self.touch("Trips/Hawaii/beach.mp4")
        self.run_agent(apply=True)
        self.assertTrue((self.movies / "Trips" / "Hawaii" / "beach.mp4").exists())

    def test_does_not_overwrite_existing_destination(self):
        self.movies.mkdir(parents=True)
        (self.movies / "Vacation.mp4").write_text("existing")
        self.touch("Vacation.mp4")
        self.run_agent(apply=True)
        self.assertTrue((self.movies / "Vacation.mp4").exists())
        self.assertTrue((self.movies / "Vacation (1).mp4").exists())
        self.assertEqual((self.movies / "Vacation.mp4").read_text(), "existing")

    def test_symlinks_are_skipped(self):
        target = self.touch("real_movie.mp4")
        link = self.desktop / "link.mp4"
        os.symlink(target, link)
        self.run_agent(apply=True, show_skips=True)
        self.assertTrue(link.is_symlink())
        self.assertFalse((self.movies / "link.mp4").exists())
        self.assertTrue((self.movies / "real_movie.mp4").exists())

    def test_does_not_delete_anything(self):
        self.touch("clip.mp4")
        self.run_agent(apply=True)
        self.assertFalse((self.desktop / "clip.mp4").exists())
        self.assertTrue((self.movies / "clip.mp4").exists())


if __name__ == "__main__":
    unittest.main()
