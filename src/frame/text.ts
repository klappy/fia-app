// Text helpers of the shared app layer (mock NB / TITLE, cookbook design/alpha-v2-screens/_frame.js:81-83).
// Pure: the models (passageCard, pericopeList, completionModel) and the screens import them from here.

/** No-break space: "part 7" never breaks before its number. */
export const NB = '\u00a0';

/** "Mark 1:1–13" never breaks at the dash (word joiners around the en dash). */
export const keepRef = (title: string) => title.replace(/–/g, '\u2060–\u2060');

/** A trailing number stays on the line of the word before it ("part 7"). */
export const keepNumber = (s: string) => s.replace(/ (\d+)$/, `${NB}$1`);
