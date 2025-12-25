---
title: Web Search Integration
tags:
  - web-search
  - duckduckgo
  - wikipedia
  - real-time-info
  - free-api
---

# Web Search Integration

Free web search using DuckDuckGo and Wikipedia (no API key required).

---

## The Problem

LLMs have a knowledge cutoff date:
- Can't answer about recent events
- No current news or updates
- Outdated information

---

## Solution: Free Web APIs

```
┌─────────────────────────────────────────────────────────────┐
│                    WEB SEARCH FLOW                           │
│                                                              │
│  User: "What is the latest news about AI?"                  │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Keyword Detection                                    │    │
│  │ "what is" / "latest" / "news" → needsWebSearch()    │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ DuckDuckGo Instant Answer API                       │    │
│  │ api.duckduckgo.com/?q=AI+news&format=json           │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                  │
│           │ (fallback if no results)                        │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Wikipedia API                                        │    │
│  │ en.wikipedia.org/api/rest_v1/page/summary/AI        │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Inject into LLM Prompt                              │    │
│  │ "LATEST INFO: [search results]"                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Trigger Keywords

Search is triggered when user message contains:

```javascript
const searchKeywords = [
  // English
  'what is', 'who is', 'tell me about', 'explain',
  'news', 'latest', 'how does', 'why is', 'when did',
  'where is', 'information about',

  // Hindi
  'क्या है', 'कौन है', 'बताओ', 'समझाओ',
  'खबर', 'जानकारी', 'कैसे', 'क्यों', 'कब', 'कहाँ',
  'के बारे में',
];

function needsWebSearch(message) {
  const lower = message.toLowerCase();
  return searchKeywords.some(kw => lower.includes(kw));
}
```

---

## DuckDuckGo API

Free Instant Answer API (no key needed).

### Request

```javascript
const response = await axios.get('https://api.duckduckgo.com/', {
  params: {
    q: query,           // Search query
    format: 'json',     // Response format
    no_html: 1,         // Strip HTML
    skip_disambig: 1,   // Skip disambiguation
  },
  timeout: 5000,
});
```

### Response Structure

```json
{
  "Abstract": "Main answer text...",
  "AbstractSource": "Wikipedia",
  "Heading": "Topic Name",
  "RelatedTopics": [
    { "Text": "Related info 1" },
    { "Text": "Related info 2" }
  ],
  "Infobox": {
    "content": [
      { "label": "Founded", "value": "2020" }
    ]
  }
}
```

### Parsing Results

```javascript
const results = [];

// Abstract (main answer)
if (data.Abstract) {
  results.push({
    title: data.Heading || query,
    description: data.Abstract,
    source: data.AbstractSource || 'DuckDuckGo',
  });
}

// Related topics
if (data.RelatedTopics) {
  data.RelatedTopics.slice(0, 2).forEach(topic => {
    if (topic.Text) {
      results.push({
        title: topic.Text.split(' - ')[0],
        description: topic.Text,
        source: 'DuckDuckGo',
      });
    }
  });
}

// Infobox facts
if (data.Infobox?.content) {
  const facts = data.Infobox.content
    .slice(0, 3)
    .map(f => `${f.label}: ${f.value}`)
    .join('. ');

  results.push({
    title: 'Quick Facts',
    description: facts,
    source: 'DuckDuckGo',
  });
}
```

---

## Wikipedia API

Fallback when DuckDuckGo has no results.

### Summary Endpoint

```javascript
const wikiLang = language === 'hi' ? 'hi' : 'en';

const response = await axios.get(
  `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
  {
    timeout: 5000,
    headers: { 'User-Agent': 'SoulmateAI/1.0' },
  }
);
```

### Response

```json
{
  "title": "Artificial intelligence",
  "extract": "Artificial intelligence (AI) is intelligence demonstrated by machines...",
  "thumbnail": { "source": "https://..." }
}
```

### Search Endpoint (fallback)

If direct page lookup fails, search Wikipedia:

```javascript
const response = await axios.get(
  `https://${wikiLang}.wikipedia.org/w/api.php`,
  {
    params: {
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      srlimit: 2,
    },
  }
);
```

---

## Full Implementation

<details>
<summary>searchWeb Function</summary>

```javascript
async function searchWeb(query, language = 'en') {
  const results = [];

  try {
    // 1. Try DuckDuckGo
    try {
      const ddg = await axios.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_html: 1 },
        timeout: 5000,
      });

      if (ddg.data.Abstract) {
        results.push({
          title: ddg.data.Heading || query,
          description: ddg.data.Abstract,
          source: ddg.data.AbstractSource || 'DuckDuckGo',
        });
      }

      // Add related topics
      ddg.data.RelatedTopics?.slice(0, 2).forEach(t => {
        if (t.Text) results.push({
          title: t.Text.split(' - ')[0],
          description: t.Text,
          source: 'DuckDuckGo',
        });
      });

    } catch (err) {
      console.warn('DuckDuckGo failed:', err.message);
    }

    // 2. Try Wikipedia if needed
    if (results.length < 2) {
      try {
        const lang = language === 'hi' ? 'hi' : 'en';
        const wiki = await axios.get(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
          { timeout: 5000 }
        );

        if (wiki.data.extract) {
          results.push({
            title: wiki.data.title || query,
            description: wiki.data.extract,
            source: 'Wikipedia',
          });
        }
      } catch (err) {
        // Try search instead
        const lang = language === 'hi' ? 'hi' : 'en';
        const search = await axios.get(
          `https://${lang}.wikipedia.org/w/api.php`,
          {
            params: {
              action: 'query',
              list: 'search',
              srsearch: query,
              format: 'json',
              srlimit: 2,
            },
          }
        );

        search.data.query?.search?.forEach(item => {
          results.push({
            title: item.title,
            description: item.snippet.replace(/<[^>]*>/g, ''),
            source: 'Wikipedia',
          });
        });
      }
    }

    return results.length > 0 ? results : null;

  } catch (error) {
    console.error('Web search failed:', error);
    return null;
  }
}
```

</details>

---

## Prompt Integration

Search results are added to the LLM prompt:

```javascript
const webContext = webSearchResults?.length > 0
  ? `\n\nLATEST NEWS/INFORMATION FROM WEB:\n${
      webSearchResults.map(r =>
        `- ${r.title}: ${r.description} (Source: ${r.source})`
      ).join('\n')
    }`
  : '';

const systemPrompt = `
  You are their soulmate...

  ${webContext}

  They said: "${userMessage}"
`;
```

---

## Language Support

| Language | DuckDuckGo | Wikipedia |
|----------|------------|-----------|
| English | ✅ | en.wikipedia.org |
| Hindi | ✅ | hi.wikipedia.org |
| Spanish | ✅ | es.wikipedia.org |
| French | ✅ | fr.wikipedia.org |
| German | ✅ | de.wikipedia.org |

---

## Limitations

| Limitation | Workaround |
|------------|------------|
| DuckDuckGo Instant Answers limited | Wikipedia fallback |
| No real-time news | DuckDuckGo sometimes has recent info |
| Rate limits | 5s timeout, graceful fallback |
| No paid news sources | Sufficient for general knowledge |

---

## Related

- [[02-Voice-Pipeline]] - Where search fits in pipeline
- [[05-Memory-RAG]] - How search combines with memory

#web-search #duckduckgo #wikipedia #real-time-info #free-api
