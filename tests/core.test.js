const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, inlineScripts } = require('./load-core');

const C = loadCore();
const ex = (o) => Object.assign({ sets: 3, lo: 8, hi: 12, step: 2.5, start: null }, o);
const prev = (sets, feel) => {
  const entry = C.norm({ s: sets.map(([kg, reps]) => ({ kg, reps })), feel: feel || null });
  return { entry, kg: C.topKg(entry) };
};

test('все встроенные скрипты без синтаксических ошибок', () => {
  for (const s of inlineScripts()) assert.doesNotThrow(() => new Function(s.code));
});

test('расчётный 1ПМ по Эпли', () => {
  assert.equal(C.e1({ kg: 100, reps: 1 }), 100);
  assert.equal(C.e1({ kg: 100, reps: 10 }), 100 * (1 + 10 / 30));
  assert.equal(C.e1({ kg: 60, reps: 0 }), null);
  assert.equal(C.e1({ kg: null, reps: 5 }), null);
  assert.equal(C.e1({ kg: 60, reps: null }), null);
});

test('bestOf берёт лучший вес и лучший 1ПМ из разных подходов', () => {
  const b = C.bestOf({ s: [{ kg: 100, reps: 1 }, { kg: 90, reps: 8 }] });
  assert.equal(b.kg, 100);
  assert.equal(b.e1, 90 * (1 + 8 / 30));
  assert.deepEqual(C.bestOf({ s: [] }), { kg: null, e1: null });
});

test('подсказка: без истории и без стартового веса нет подсказки', () => {
  assert.equal(C.suggest(ex(), null), null);
});

test('подсказка: стартовый вес', () => {
  const s = C.suggest(ex({ start: 40 }), null);
  assert.equal(s.kind, 'start');
  assert.equal(s.kg, 40);
  assert.equal(s.reps, 8);
  assert.match(s.why, /3 подхода по 8–12/);
});

test('подсказка: верх диапазона во всех подходах — вес растёт на шаг', () => {
  const s = C.suggest(ex(), prev([[50, 12], [50, 12], [50, 13]]));
  assert.equal(s.kind, 'up');
  assert.equal(s.kg, 52.5);
  assert.equal(s.reps, 8);
});

test('подсказка: «на пределе» удерживает вес', () => {
  const s = C.suggest(ex(), prev([[50, 12], [50, 12], [50, 12]], 3));
  assert.equal(s.kind, 'hold');
  assert.equal(s.kg, 50);
  assert.equal(s.reps, 12);
});

test('подсказка: не все подходы набраны — добавить повтор', () => {
  const s = C.suggest(ex(), prev([[50, 12], [50, 10], [50, 9]]));
  assert.equal(s.kind, 'hold');
  assert.equal(s.kg, 50);
  assert.equal(s.reps, 10);
});

test('подсказка: меньше низа диапазона — цель низ', () => {
  const s = C.suggest(ex(), prev([[50, 8], [50, 6]]));
  assert.equal(s.reps, 8);
});

test('подсказка: подходов меньше нужного — вес не растёт', () => {
  const s = C.suggest(ex(), prev([[50, 12], [50, 12]]));
  assert.equal(s.kind, 'hold');
});

test('подсказка: считаются только подходы с максимальным весом', () => {
  const s = C.suggest(ex({ sets: 2 }), prev([[40, 5], [50, 12], [50, 12]]));
  assert.equal(s.kind, 'up');
  assert.equal(s.kg, 52.5);
});

test('шаг веса округляется без хвостов', () => {
  const s = C.suggest(ex({ step: 0.1, sets: 1 }), prev([[0.2, 12]]));
  assert.equal(s.kg, 0.3);
});

test('enc/dec: запись тренировки переживает сохранение', () => {
  const doc = {
    date: '2026-10-18', day: 2,
    entries: { sq: C.norm({ w: { kg: 40, reps: 10 }, s: [{ kg: 80, reps: 8 }, { kg: 80, reps: 7.5 }], feel: 2 }) }
  };
  assert.deepEqual(C.dec(C.enc(doc)), doc);
});

test('dec читает старый формат v1', () => {
  const d = C.dec(JSON.stringify({ d: '2025-01-02', y: 1, e: { a: [20, 10, 60, 8, 60, 8, null, null, 3] } }));
  assert.equal(d.date, '2025-01-02');
  assert.deepEqual(d.entries.a.w, { kg: 20, reps: 10 });
  assert.equal(d.entries.a.s[1].kg, 60);
  assert.equal(d.entries.a.feel, 3);
});

test('norm отбрасывает мусор и лишние подходы', () => {
  const e = C.norm({ s: Array.from({ length: 10 }, () => ({ kg: '5', reps: -1 })), feel: 7 });
  assert.equal(e.s.length, C.MAXSETS);
  assert.deepEqual(e.s[0], { kg: 5, reps: null });
  assert.equal(e.feel, null);
});

test('таблица для Excel', () => {
  const sessions = [{
    id: '2026-10-18_d1',
    doc: { date: '2026-10-18', day: 1, entries: { a: { w: { kg: 20, reps: 10 }, s: [{ kg: 52.5, reps: 8 }, { kg: null, reps: null }], feel: 1 } } }
  }];
  const tsv = C.toTsv(C.workoutRows(sessions, () => 'Ноги', () => 'Присед\tсо штангой'));
  assert.equal(tsv, [
    'Дата\tДень\tУпражнение\tПодход\tВес, кг\tПовторы\tОщущение',
    '2026-10-18\tНоги\tПрисед со штангой\tРазминка\t20\t10\t',
    '2026-10-18\tНоги\tПрисед со штангой\t1\t52,5\t8\tЛегко'
  ].join('\n'));
  assert.equal(C.toTsv(C.workoutRows([], () => '', () => '')), '');
});

test('plural для русского', () => {
  const p = (n) => C.plural(n, 'подход', 'подхода', 'подходов');
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map(p),
    ['подход', 'подхода', 'подходов', 'подходов', 'подходов', 'подход', 'подхода', 'подходов', 'подходов']);
});
