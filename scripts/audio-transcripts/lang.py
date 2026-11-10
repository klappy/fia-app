"""Language support for the word-transcript pipeline (en | es), shared by transcribe.py and any aligner.

One module, one place: the matching normaliser, the ASR language code and the default model per language, and how the
language is recorded. English behaviour is frozen: norm(t, 'en') is the original normaliser, byte for byte.

Spanish normalisation PRESERVES accents and n-tilde (and u-dieresis) for matching: a-with-acute and a are different
spellings, and so are n and n-tilde (año / ano). It lowercases and strips punctuation (including the inverted
marks) and spaces only. Text is NFC-normalised first so a composed and a decomposed spelling match.

Recording the language WITHOUT a schema bump: `fia-word-transcript@1` does not reject unknown top-level fields
(validateTranscript checks only schema, clockDomain, durationMs and the word arrays), so a non-English sidecar carries an
optional top-level `language` field (ISO 639-1). An English sidecar omits it; absent means 'en', which keeps English
output byte-identical. The pack's own language ('spa' in the registry/pack id) remains the manifest-level record.
Moving to @2 is a captain decision and is not done here.
"""
import re
import unicodedata

LANGS = {
    'en': dict(whisper='en', model='small.en', keep=r"[^a-z0-9']", name='English'),
    # Multilingual model: the '.en' models cannot transcribe Spanish.
    'es': dict(whisper='es', model='small', keep=r"[^a-z0-9'\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1]", name='Spanish'),
}


def check_lang(lang):
    if lang not in LANGS:
        raise ValueError("unsupported language %r (supported: %s)" % (lang, ', '.join(sorted(LANGS))))
    return lang


def norm(text, lang='en'):
    """Matching form of a word: lowercase, punctuation removed; accents and n-tilde kept for 'es'."""
    check_lang(lang)
    if lang == 'en':
        return re.sub(r"[^a-z0-9']", '', text.lower())  # unchanged from the original transcribe.py
    return re.sub(LANGS[lang]['keep'], '', unicodedata.normalize('NFC', text).lower())


def whisper_language(lang):
    return LANGS[check_lang(lang)]['whisper']


def default_model(lang):
    return LANGS[check_lang(lang)]['model']


def sidecar_language_fields(lang):
    """Extra top-level sidecar fields for this language: none for English (byte-identical output), `language` otherwise."""
    check_lang(lang)
    return {} if lang == 'en' else {'language': lang}
