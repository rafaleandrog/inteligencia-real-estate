"""Nome, slug e código romano das RAs — paridade byte a byte com `optional-apps-script/Code.gs`.

`titleCaseRaName_`, `normalizeSlug_`, `numberToRoman_` e `raNumberFromCode_` são as funções
que gravam `ra_name`, slug e `ra_geo_id` na planilha. Copiá-las aqui (e não "fazer parecido")
é o que garante que a ponte publicada em `data/public/ra_crosswalk.json` case com a planilha
(R8.44: copie o valor e cite a origem). `tests/ra-crosswalk-parity.test.js` executa o `Code.gs`
real contra o arquivo gerado para pegar qualquer deriva.
"""

from __future__ import annotations

import re
import unicodedata

_KEEP_LOWER = {"de", "da", "do", "das", "dos", "e"}
_ROMAN_TABLE = (
    (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
    (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
)
_ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def title_case_ra_name(name: object) -> str:
    """`CANDANGOLÂNDIA` → `Candangolândia`; preposições minúsculas; `SIA`/`SCIA` preservados."""
    text = "" if name is None else str(name).strip().lower()
    parts = re.split(r"\s+", text) if text else [""]
    out = []
    for i, part in enumerate(parts):
        if i > 0 and part in _KEEP_LOWER:
            out.append(part)
        else:
            out.append(part[0].upper() + part[1:] if part else part)
    joined = " ".join(out)
    return joined.replace("Scia", "SCIA").replace("Sia", "SIA")


def normalize_slug(value: object) -> str:
    text = "" if value is None else str(value).strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if not ("̀" <= ch <= "ͯ"))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def int_to_roman(value: int) -> str:
    n = int(round(value))
    out = ""
    for amount, symbol in _ROMAN_TABLE:
        while n >= amount:
            out += symbol
            n -= amount
    return out


def roman_to_int(roman: str) -> int | None:
    """Só aceita a forma canônica: `IIII` e `IXX` devolvem None, não um número plausível."""
    text = str(roman or "").strip().upper()
    if not text:
        return None
    total = 0
    prev = 0
    for ch in reversed(text):
        v = _ROMAN_VALUES.get(ch, 0)
        if not v:
            return None
        if v < prev:
            total -= v
        else:
            total += v
            prev = v
    if total < 1:
        return None
    return total if int_to_roman(total) == text else None


def ra_number_from_code(code: object) -> int | None:
    text = str(code or "").strip().upper()
    roman = re.sub(r"^RA[-\s]*", "", text).strip()
    return roman_to_int(roman)


def ra_geo_id(ra_number: int) -> str:
    """`'RA_' + ('0' + n).slice(-2)` do Code.gs: dois dígitos sempre (RA 100+ não existe)."""
    return "RA_" + ("0" + str(int(round(ra_number))))[-2:]
