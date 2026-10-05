import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

script = pathlib.Path(__file__).resolve().parents[2] / "server/fia/preparation/executor/local-recognize.py"
spec = importlib.util.spec_from_file_location("recognizer", script)
recognizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recognizer)

class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.source = pathlib.Path(self.directory.name) / "source.mp3"
        self.source.write_bytes(b"known source")
        self.job = {"sourcePath": str(self.source), "sourceSha256": recognizer.digest(self.source.read_bytes()),
                    "sourceBytes": self.source.stat().st_size, "language": "en", "modelId": "local-test",
                    "modelManifestSha256": "0" * 64, "runtimeManifestSha256": "0" * 64}

    def test_wrong_source_hash_rejected_before_loading_model(self):
        self.job["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "source-hash"):
            recognizer.recognize(self.job, "/missing-model")

    def test_wrong_length_rejected_before_loading_model(self):
        self.job["sourceBytes"] += 1
        with self.assertRaisesRegex(ValueError, "source-length"):
            recognizer.recognize(self.job, "/missing-model")

    def test_model_manifest_rejected_without_runtime_or_download(self):
        model = pathlib.Path(self.directory.name) / "model"
        model.mkdir()
        (model / "model.bin").write_bytes(b"different model")
        with self.assertRaisesRegex(ValueError, "model-manifest-hash"):
            recognizer.recognize(self.job, model)

    def test_runtime_change_rejected_before_loading_model(self):
        model = pathlib.Path(self.directory.name) / "model"
        model.mkdir()
        (model / "model.bin").write_bytes(b"pinned model")
        files = {"model.bin": {"sha256": recognizer.digest(b"pinned model"), "bytes": 12}}
        self.job["modelManifestSha256"] = recognizer.digest(recognizer.canonical(files))
        with patch.object(recognizer.importlib.metadata, "version", return_value="changed"):
            with self.assertRaisesRegex(ValueError, "runtime-manifest-hash"):
                recognizer.recognize(self.job, model)

    def test_extra_prompt_or_url_cannot_be_smuggled_in(self):
        self.job["initial_prompt"] = "invented script"
        with self.assertRaisesRegex(ValueError, "invalid-local-recognition-input"):
            recognizer.recognize(self.job, "/missing-model")

    def test_nonfinite_json_rejected(self):
        with self.assertRaises(ValueError):
            recognizer.canonical({"start": float("nan")})

if __name__ == "__main__":
    unittest.main()
