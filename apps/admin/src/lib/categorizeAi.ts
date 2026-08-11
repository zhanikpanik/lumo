const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY as string;

interface AIDish {
  id: string;
  name: string;
  current_category: string;
  workshop: string;
}

export interface AIGroup {
  name: string;
  dish_ids: string[];
  confidence: number;
}

export async function categorizeDishes(dishes: AIDish[]): Promise<AIGroup[]> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('VITE_DEEPSEEK_API_KEY не задан в .env');
  }

  if (dishes.length === 0) {
    return [];
  }

  // Use short numeric IDs to save tokens — map back after parsing
  const shortIdMap = new Map<string, string>();
  const shortDishes = dishes.map((d, i) => {
    const shortId = String(i + 1);
    shortIdMap.set(shortId, d.id);
    return { shortId, name: d.name, category: d.current_category, workshop: d.workshop };
  });

  const prompt = `Ты — шеф-повар ресторана. Сгруппируй блюда из меню в 8–14 логических категорий для POS-терминала официантов.

Правила:
1. Объединяй похожие категории (Виски + Бренди + Водка → «Крепкий алкоголь»)
2. Категории с 1-2 блюдами поглощай более крупными
3. Алкогольные напитки не смешивай с безалкогольными
4. Кофе и чай — всегда отдельные категории
5. Названия категорий — короткие (1-3 слова), на языке блюд
6. Каждая категория должна содержать от 3 до 25 блюд
7. Каждое блюдо должно быть ровно в одной категории
8. Все блюда должны быть распределены, ни одного пропущенного
9. Используй ТОЛЬКО числовые ID блюд (1, 2, 3, ...)

Блюда (ID, название, текущая категория, цех):
${shortDishes.map((d) => `${d.shortId} | ${d.name} | сейчас: ${d.category} | цех: ${d.workshop}`).join('\n')}

Верни ТОЛЬКО валидный JSON без markdown-форматирования, без \`\`\`json:
{
  "groups": [
    {
      "name": "Название категории",
      "dish_ids": ["1", "2"]
    }
  ]
}`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('DeepSeek вернул пустой ответ');
  }

  // DeepSeek sometimes wraps JSON in ```json ... ``` — strip markdown fences
  content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  // Try to extract the JSON object if there's text around it
  const jsonStart = content.indexOf('{');
  const jsonEnd = content.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    content = content.slice(jsonStart, jsonEnd + 1);
  }

  let parsed: { groups?: AIGroup[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    // Log raw response for debugging — first 500 chars
    console.error('DeepSeek raw response:', content.slice(0, 500));
    throw new Error('DeepSeek вернул невалидный JSON. Сырой ответ в консоли.');
  }

  if (!parsed.groups || !Array.isArray(parsed.groups)) {
    throw new Error('Ответ не содержит groups[]');
  }

  // Validate: all dish IDs present, no duplicates
  const allIds = new Set(dishes.map((d) => d.id));
  const assignedShortIds = new Set<string>();
  const validGroups: AIGroup[] = [];

  for (const g of parsed.groups) {
    if (!g.name || !Array.isArray(g.dish_ids)) continue;
    // Map short IDs back to real UUIDs
    const validRealIds = g.dish_ids
      .map((sid: string) => shortIdMap.get(String(sid)))
      .filter((id): id is string => !!id && allIds.has(id) && !assignedShortIds.has(id));
    if (validRealIds.length === 0) continue;
    for (const id of validRealIds) assignedShortIds.add(id);
    validGroups.push({ name: g.name, dish_ids: validRealIds, confidence: g.confidence ?? 0.8 });
  }

  // Any unassigned dishes go to "Прочее"
  const unassigned = [...allIds].filter((id) => !assignedShortIds.has(id));
  if (unassigned.length > 0) {
    validGroups.push({ name: 'Прочее', dish_ids: unassigned, confidence: 0.5 });
  }

  return validGroups;
}
