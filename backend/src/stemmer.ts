/**
 * Deterministic Russian Snowball stemmer (identical algorithm to `scripts/export_search_index.py`).
 * Used for FTS5 `lemmas` query normalization without external dependencies.
 */

const VOWELS = /[аеиоуыэюя]/;
const RVRE = /^(.*?[аеиоуыэюя])(.*)$/;

const PERFECTIVE_GERUND_1 = /([ая])(в|вши|вшись)$/;
const PERFECTIVE_GERUND_2 = /(ив|ивши|ившись|ыв|ывши|ывшись)$/;
const ADJECTIVE =
  /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PARTICIPLE_1 = /([ая])(ем|нн|вш|ющ|щ)$/;
const PARTICIPLE_2 = /(ивш|ывш|ующ)$/;
const REFLEXIVE = /(ся|сь)$/;
const VERB_1 =
  /([ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)$/;
const VERB_2 =
  /(ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)$/;
const NOUN =
  /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
const SUPERLATIVE = /(ейш|ейше)$/;
const DERIVATIONAL = /(ост|ость)$/;
const I_ENDING = /и$/;
const NN_ENDING = /нн$/;
const SOFT_SIGN = /ь$/;

function findR2(rv: string): number {
  let seenVowel = false;
  let r1 = rv.length;
  for (let i = 0; i < rv.length; i += 1) {
    const isV = VOWELS.test(rv[i]!);
    if (isV) {
      seenVowel = true;
    } else if (seenVowel) {
      r1 = i + 1;
      break;
    }
  }
  seenVowel = false;
  let r2 = rv.length;
  for (let i = r1; i < rv.length; i += 1) {
    const isV = VOWELS.test(rv[i]!);
    if (isV) {
      seenVowel = true;
    } else if (seenVowel) {
      r2 = i + 1;
      break;
    }
  }
  return r2;
}

export function stemRussianWord(raw: string): string {
  const word = raw.toLowerCase().replace(/ё/g, "е");
  if (word.length < 3 || !/[а-я]/.test(word)) return word;

  const match = RVRE.exec(word);
  if (!match) return word;

  const head = match[1]!;
  let rv = match[2]!;
  if (!rv) return word;

  const r2Start = findR2(rv);

  // Step 1
  if (PERFECTIVE_GERUND_1.test(rv)) {
    rv = rv.replace(PERFECTIVE_GERUND_1, "$1");
  } else if (PERFECTIVE_GERUND_2.test(rv)) {
    rv = rv.replace(PERFECTIVE_GERUND_2, "");
  } else {
    rv = rv.replace(REFLEXIVE, "");
    if (ADJECTIVE.test(rv)) {
      rv = rv.replace(ADJECTIVE, "");
      if (PARTICIPLE_1.test(rv)) {
        rv = rv.replace(PARTICIPLE_1, "$1");
      } else if (PARTICIPLE_2.test(rv)) {
        rv = rv.replace(PARTICIPLE_2, "");
      }
    } else if (VERB_1.test(rv)) {
      rv = rv.replace(VERB_1, "$1");
    } else if (VERB_2.test(rv)) {
      rv = rv.replace(VERB_2, "");
    } else {
      rv = rv.replace(NOUN, "");
    }
  }

  // Step 2
  rv = rv.replace(I_ENDING, "");

  // Step 3 (derivational only in R2)
  if (r2Start < rv.length) {
    const r2Part = rv.slice(r2Start);
    if (DERIVATIONAL.test(r2Part)) {
      rv = rv.slice(0, r2Start) + r2Part.replace(DERIVATIONAL, "");
    }
  }

  // Step 4
  if (NN_ENDING.test(rv)) {
    rv = rv.slice(0, -1);
  } else {
    rv = rv.replace(SUPERLATIVE, "");
    if (NN_ENDING.test(rv)) {
      rv = rv.slice(0, -1);
    } else {
      rv = rv.replace(SOFT_SIGN, "");
    }
  }

  return head + rv;
}

export function tokenizeAndStem(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/ё/g, "е")
    .match(/[a-zа-я0-9_]+/g);
  if (!tokens) return [];
  const out: string[] = [];
  for (const tok of tokens) {
    if (tok.length < 2) continue;
    out.push(/[а-я]/.test(tok) ? stemRussianWord(tok) : tok);
  }
  return out;
}

export function buildFtsMatchQuery(rawQuery: string): string {
  const rawTokens = rawQuery
    .toLowerCase()
    .replace(/ё/g, "е")
    .match(/[a-zа-я0-9_]+/g);
  if (!rawTokens || rawTokens.length === 0) return "";

  const clauses: string[] = [];
  const seen = new Set<string>();
  for (const tok of rawTokens) {
    if (tok.length < 2) continue;
    const stemmed = /[а-я]/.test(tok) ? stemRussianWord(tok) : tok;
    const key = `${tok}|${stemmed}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const escTok = tok.replace(/"/g, '""');
    const escStem = stemmed.replace(/"/g, '""');
    if (escStem !== escTok && escStem.length >= 2) {
      clauses.push(`("${escTok}"* OR "${escStem}"*)`);
    } else {
      clauses.push(`"${escTok}"*`);
    }
    if (clauses.length >= 8) break;
  }
  return clauses.join(" AND ");
}
