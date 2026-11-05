import os, re, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
import lang

LEGACY = lambda t: re.sub(r"[^a-z0-9']", '', t.lower())  # the original transcribe.py normaliser, copied verbatim

# TEST FIXTURE ONLY - not shipped as content. Human-authored, public domain: Cervantes, Don Quijote (1605), opening line.
# No machine translation, no machine voice, no scripture.
FIXTURE_ES = "En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo"
# Plain English strings (including the punctuation and unicode the original stripped).
EN_CORPUS = ["Hello, World!", "Jesus' disciples", "don't", "naïve café", "It’s 12:30 — “quoted”", "", "A-B_C 1.5", "ÀÉÎ"]


class Lang(unittest.TestCase):
    def test_english_normaliser_is_the_original(self):
        for t in EN_CORPUS + FIXTURE_ES.split():
            self.assertEqual(lang.norm(t, 'en'), LEGACY(t))
            self.assertEqual(lang.norm(t), LEGACY(t))  # default is en

    def test_english_adds_no_sidecar_field_and_keeps_model(self):
        self.assertEqual(lang.sidecar_language_fields('en'), {})
        self.assertEqual(lang.default_model('en'), 'small.en')
        self.assertEqual(lang.whisper_language('en'), 'en')

    def test_spanish_keeps_accents_and_enye(self):
        self.assertEqual(lang.norm('vivía', 'es'), 'vivía')
        self.assertEqual(lang.norm('Señor,', 'es'), 'señor')
        self.assertEqual(lang.norm('¿Qué?', 'es'), 'qué')
        self.assertEqual(lang.norm('¡Jesús!', 'es'), 'jesús')
        self.assertEqual(lang.norm('pingüino', 'es'), 'pingüino')
        self.assertNotEqual(lang.norm('año', 'es'), lang.norm('ano', 'es'))
        self.assertNotEqual(lang.norm('está', 'es'), lang.norm('esta', 'es'))
        # the English normaliser would have destroyed them
        self.assertEqual(LEGACY('vivía'), 'viva')

    def test_spanish_nfc_composed_equals_decomposed(self):
        self.assertEqual(lang.norm('vi\u0301a', 'es'), lang.norm('v\u00ed' + 'a', 'es'))
        self.assertEqual(lang.norm('n\u0303', 'es'), '\u00f1')
        self.assertEqual(lang.norm('i\u0301', 'es'), '\u00ed')

    def test_spanish_fixture_every_word_survives(self):
        words = FIXTURE_ES.split()
        self.assertTrue(all(lang.norm(w, 'es') for w in words))
        self.assertEqual(lang.norm('Mancha,', 'es'), 'mancha')
        self.assertEqual(lang.norm('vivía', 'es'), 'vivía')

    def test_spanish_language_fields_and_model(self):
        self.assertEqual(lang.sidecar_language_fields('es'), {'language': 'es'})
        self.assertEqual(lang.whisper_language('es'), 'es')
        self.assertFalse(lang.default_model('es').endswith('.en'))

    def test_unsupported_language_refuses(self):
        for bad in ('fr', 'spa', 'eng', '', None):
            with self.assertRaises(ValueError):
                lang.norm('x', bad)


if __name__ == '__main__':
    unittest.main()
