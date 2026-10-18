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

/* ---------- языки ---------- */
const { html } = require('./load-core');

test('в русском и английском одинаковые ключи и формы', () => {
  const ru = C.I18N.ru, en = C.I18N.en;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  for (const k of Object.keys(ru)) {
    assert.equal(Array.isArray(en[k]), Array.isArray(ru[k]), k);
    if (k === 'tip_g') assert.equal(en[k].length, ru[k].length);
    else if (Array.isArray(ru[k])) { assert.equal(ru[k].length, 3, k); assert.equal(en[k].length, 2, k); }
  }
});

test('все ключи из кода есть в словаре', () => {
  const used = new Set();
  for (const m of html.matchAll(/\btn?\('([a-z0-9_]+)'\s*[,)]/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n(?:-aria)?="([a-z0-9_]+)"/g)) used.add(m[1]);
  for (const k of ['feel1', 'feel2', 'feel3', 'acc_blue', 'acc_violet', 'acc_green', 'acc_orange', 'acc_pink', 'acc_graphite', 'bmi_low', 'bmi_norm', 'bmi_over', 'bmi_ob']) used.add(k);
  const missing = [...used].filter((k) => !(k in C.I18N.ru));
  assert.deepEqual(missing, []);
});

test('tr и trn: подстановка и формы чисел', () => {
  assert.equal(C.tr('ru', 'set_n', { n: 2 }), 'Подход 2');
  assert.equal(C.tr('en', 'set_n', { n: 2 }), 'Set 2');
  assert.equal(C.tr('xx', 'set_n', { n: 2 }), 'Подход 2');
  assert.equal(C.tr('ru', 'нет_такого'), 'нет_такого');
  assert.deepEqual([1, 3, 5, 21].map((n) => C.trn('ru', 'n_sets', n)), ['1 подход', '3 подхода', '5 подходов', '21 подход']);
  assert.deepEqual([1, 3].map((n) => C.trn('en', 'n_sets', n)), ['1 set', '3 sets']);
  assert.equal(C.trn('ru', 'sets_done', 2, { m: 9 }), 'Выполнено 2 подхода из 9');
});

test('подсказка на английском', () => {
  const s = C.suggest(ex(), prev([[50, 12], [50, 12], [50, 12]]), 'en');
  assert.equal(s.tag, 'Add weight');
  assert.match(s.why, /8–12/);
});

/* ---------- упражнения со своим весом ---------- */
const bw = (o) => ex(Object.assign({ bw: true, lo: 10, hi: 20 }, o));
const prevBw = (sets, feel) => {
  const entry = C.norm({ s: sets.map(([kg, reps]) => ({ kg, reps })), feel: feel || null });
  return { entry, kg: C.topKg(entry) };
};

test('свой вес: хватает повторов без веса', () => {
  const e = C.norm({ s: [{ kg: null, reps: 15 }, { kg: null, reps: 12 }] });
  assert.equal(C.has(e, true), true);
  assert.equal(C.has(e, false), false);
  assert.equal(C.topReps(e), 15);
  assert.equal(C.sumReps(e), 27);
  assert.equal(C.volume(e), 0);
});

test('свой вес: без стартового веса и без истории подсказки нет', () => {
  assert.equal(C.suggest(bw({ start: 10 }), null), null);
});

test('свой вес: добавлять по повтору', () => {
  const s = C.suggest(bw(), prevBw([[null, 14], [null, 12], [null, 11]]));
  assert.equal(s.kind, 'hold');
  assert.equal(s.kg, 0);
  assert.equal(s.reps, 12);
  assert.match(s.why, /усложнить/);
});

test('свой вес: верх диапазона во всех подходах — усложнить', () => {
  const s = C.suggest(bw(), prevBw([[null, 20], [null, 21], [null, 20]]));
  assert.equal(s.kind, 'up');
  assert.equal(s.kg, 2.5);
  assert.equal(s.reps, 10);
});

test('свой вес: с отягощением считается подход на максимальном весе', () => {
  const s = C.suggest(bw({ sets: 2 }), prevBw([[null, 20], [10, 20], [10, 20]]));
  assert.equal(s.kind, 'up');
  assert.equal(s.kg, 12.5);
});

test('запись только с повторами переживает сохранение', () => {
  const doc = { date: '2026-10-18', day: 1, entries: { pu: C.norm({ s: [{ kg: null, reps: 25 }, { kg: 10, reps: 12 }] }) } };
  assert.deepEqual(C.dec(C.enc(doc)), doc);
});

/* ---------- сводки ---------- */
const sess = (date, entries) => ({ id: date + '_d1', doc: { date, day: 1, entries } });

test('недели с понедельника', () => {
  assert.equal(C.weekStartStr('2026-10-18'), '2026-10-12');
  assert.equal(C.weekStartStr('2026-10-12'), '2026-10-12');
  assert.equal(C.daysBetween('2026-10-01', '2026-10-18'), 17);
  const w = C.weeks([
    sess('2026-10-05', { a: { s: [{ kg: 50, reps: 10 }] } }),
    sess('2026-10-13', { a: { s: [{ kg: 50, reps: 10 }, { kg: 50, reps: 8 }] } }),
    sess('2026-10-18', { a: { s: [{ kg: null, reps: 20 }] } }),
    sess('2026-01-01', { a: { s: [{ kg: 1, reps: 1 }] } })
  ], '2026-10-18', 3, (d) => C.volume(d.entries.a));
  assert.deepEqual(w.map((x) => x.start), ['2026-09-28', '2026-10-05', '2026-10-12']);
  assert.deepEqual(w.map((x) => x.count), [0, 1, 2]);
  assert.deepEqual(w.map((x) => x.sets), [0, 1, 3]);
  assert.equal(w[2].vol, 900);
});

test('рекорды за период: первая запись не рекорд', () => {
  const list = [
    sess('2026-09-01', { a: { s: [{ kg: 50, reps: 5 }] }, b: { s: [{ kg: null, reps: 10 }] } }),
    sess('2026-10-01', { a: { s: [{ kg: 55, reps: 5 }] }, b: { s: [{ kg: null, reps: 12 }] } }),
    sess('2026-10-10', { a: { s: [{ kg: 55, reps: 6 }] }, c: { s: [{ kg: 20, reps: 5 }] } })
  ];
  assert.equal(C.prCount(list, '2026-09-15', (id) => id === 'b'), 2);
  assert.equal(C.prCount(list, '2026-09-15', () => false), 1);
});

test('вес стоит три тренировки', () => {
  const h = (kg, reps) => ({ kg, entry: C.norm({ s: reps.map((r) => ({ kg, reps: r })) }) });
  assert.equal(C.stalled([h(50, [8, 8]), h(50, [8, 7]), h(50, [8, 8])]), true);
  assert.equal(C.stalled([h(50, [8, 8]), h(50, [8, 8]), h(50, [9, 8])]), false);
  assert.equal(C.stalled([h(50, [8, 8]), h(50, [8, 8]), h(52.5, [6, 6])]), false);
  assert.equal(C.stalled([h(50, [8, 8]), h(50, [8, 8])]), false);
});

test('ИМТ и взвешивание раз в неделю', () => {
  assert.equal(C.bmi(180, 81), 25);
  assert.equal(C.bmi(null, 81), null);
  assert.equal(C.bmiCat(17), 'bmi_low');
  assert.equal(C.bmiCat(22), 'bmi_norm');
  assert.equal(C.bmiCat(25), 'bmi_over');
  assert.equal(C.bmiCat(31), 'bmi_ob');
  assert.deepEqual(C.weighDue([], '2026-10-18'), { due: true, days: null });
  assert.deepEqual(C.weighDue([{ date: '2026-10-12', kg: 80 }], '2026-10-18'), { due: false, days: 6 });
  assert.deepEqual(C.weighDue([{ date: '2026-10-11', kg: 80 }, { date: '2026-10-01', kg: 81 }], '2026-10-18'), { due: true, days: 7 });
});

test('советы по ситуации', () => {
  const base = { today: '2026-10-18', total: 10, last: '2026-10-17', week: 3, goal: 3, dow: 6, weighDays: 2, kg: null, up: 0, stalled: [] };
  assert.equal(C.tips(base).length, 1);
  const all = C.tips(Object.assign({}, base, { last: '2026-10-01', weighDays: 9, up: 2, stalled: ['Жим'], week: 1, kg: 80 }));
  assert.match(all[0], /Перерыв 17 дней/);
  assert.match(all[1], /прошло 9 дней/);
  assert.match(all[2], /в 2 упражнениях/);
  assert.match(all[3], /«Жим»/);
  assert.match(all[4], /осталось 2 тренировки/);
  assert.match(all[5], /130–175 г/);
  assert.match(C.tips(Object.assign({}, base, { total: 0, last: null, weighDays: null }))[0], /запасом/);
  assert.equal(C.tips(Object.assign({}, base, { weighDays: -1 })).length, 1);
  assert.match(C.tips(base, 'en')[0], /[a-z]/);
});
