#!/usr/bin/env python3
"""THE ENGLISH DICTIONARY (en/README.md): tools/words.py for en -- read every line, check it against the concept index,
compile en/dict.tsv.

    python3 tools/en.py            # check every en/<folder>/<file>.txt
    python3 tools/en.py --compile  # ... and write en/dict.tsv
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import words
from words import Bad

parse_line = lambda s: words.parse_line(s, "en")
files = lambda: words.files("en")

if __name__ == "__main__":
    words.main("en")
