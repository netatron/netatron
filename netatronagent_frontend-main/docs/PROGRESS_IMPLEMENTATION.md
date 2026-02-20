# Implementacja Paska Postępu dla Scraperów

## Przegląd

System paska postępu dla scraperów składa się z trzech głównych elementów:

1. **`useJobProgress`** - Hook zarządzający stanem postępu
2. **`ProgressIndicator`** - Komponent wizualizujący postęp
3. **Integracja z `PageHeader`** - Wyświetlanie postępu w nagłówku modułu

## Architektura

```
┌─────────────────────────────────────────────────────────────────┐
│                         PageHeader                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    ProgressIndicator                         ││
│  │  ████████████████████░░░░░░░░░░░░  67% | 67/100 | ETA: 45s  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    ┌─────────┴─────────┐
                    │   useJobProgress   │
                    │  (polling/mock)    │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │    Backend API     │
                    │  GET /jobs/{id}    │
                    └───────────────────┘
```

## Aktualny Stan (Mockup)

Obecna implementacja symuluje postęp podczas działania scrapera:
- Inkrementacja co 2 sekundy (konfigurowalne)
- Losowy przyrost 1-4% na interwał
- Automatyczne obliczanie ETA
- Reset przy zatrzymaniu/nowym jobie

## Integracja z Backend API

### Krok 1: Odkomentuj kod API w `use-job-progress.ts`

Znajdź sekcję `API INTEGRATION` w pliku `src/hooks/use-job-progress.ts` i odkomentuj odpowiedni kod:

```typescript
useEffect(() => {
  if (!jobId || status !== "running") return;
  
  const fetchProgress = async () => {
    try {
      // Wybierz odpowiedni endpoint:
      
      // Dla Google Maps:
      const response = await api.googleMaps.getGoogleMapsTask(jobId);
      setProgress(response.progress || 0);
      setProcessedRecords(response.query_index || 0);
      setTotalRecords(response.total_queries || 0);
      
      // Dla KPO:
      // const response = await api.kpo.getKpoJobStatus(jobId);
      // setProgress(response.progress || 0);
      // setProcessedRecords(response.processed_records || 0);
      // setTotalRecords(response.total_records || 0);
      
    } catch (error) {
      console.error("Failed to fetch job progress:", error);
    }
  };
  
  fetchProgress();
  const interval = setInterval(fetchProgress, pollInterval);
  
  return () => clearInterval(interval);
}, [jobId, status, pollInterval]);
```

### Krok 2: Zaktualizuj scrapers, aby przekazywały rzeczywiste `jobId`

W `GoogleMaps.tsx` i `KPO.tsx`:

```typescript
const handleStart = async () => {
  // ...validation...
  
  // Zamiast mockowej symulacji:
  const response = await api.googleMaps.startGoogleMapsTask({
    queries: validQueries,
    desired_results: desiredResults,
  });
  
  setCurrentJobId(response.job_id); // Ten jobId jest przekazywany do useJobProgress
  setModuleStatus("running");
};
```

### Krok 3: Usuń mockową symulację

Po podłączeniu API, usuń efekt symulujący postęp w `use-job-progress.ts` (sekcja `MOCK SIMULATION`).

## Oczekiwana Struktura Odpowiedzi API

### Google Maps Task Status

```typescript
GET /api/v1/google-maps/tasks/{task_id}

Response: {
  task_id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  progress: number;           // 0-100
  query_index: number;        // Current query being processed
  total_queries: number;      // Total queries to process
  results_count: number;      // Results collected so far
  eta?: string;               // Optional: Server-calculated ETA
  error?: string;
}
```

### KPO Job Status

```typescript
GET /api/v1/kpo/jobs/{job_id}/status

Response: {
  job_id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  progress: number;           // 0-100
  processed_records: number;  // Records scraped
  total_records: number;      // Expected total records
  current_category?: string;  // Currently processing category
  eta?: string;
  error?: string;
}
```

### Generic Job Status

```typescript
GET /api/v1/jobs/{job_id}

Response: {
  job_id: string;
  module: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  progress: number;
  processed: number;
  total: number;
  started_at: string;
  updated_at: string;
  eta?: string;
  error?: string;
}
```

## Konfiguracja

### Interwał Pollingu

```typescript
const { progress, processedRecords, totalRecords, eta } = useJobProgress(
  currentJobId,
  moduleStatus,
  { 
    pollInterval: 1000,     // Poll co 1 sekundę (domyślnie: 2000ms)
    totalRecords: 500       // Oczekiwana liczba rekordów (dla symulacji)
  }
);
```

### Warianty Wyświetlania

```typescript
// Pełny pasek z detalami
<ProgressIndicator
  progress={progress}
  status={moduleStatus}
  variant="full"
  showPercentage={true}
  showDetails={true}
  processedRecords={processedRecords}
  totalRecords={totalRecords}
  eta={eta}
/>

// Kompaktowy pasek (bez detali)
<ProgressIndicator
  progress={progress}
  status={moduleStatus}
  variant="inline"
  showPercentage={true}
/>
```

## Checklist Wdrożeniowy

- [ ] Upewnij się, że backend zwraca `progress` (0-100) w odpowiedzi statusu
- [ ] Upewnij się, że backend zwraca `processed_records` i `total_records`
- [ ] Odkomentuj kod API w `use-job-progress.ts`
- [ ] Zaktualizuj scrapers, aby ustawiały `currentJobId` z odpowiedzi API
- [ ] Usuń mockową symulację postępu
- [ ] Przetestuj polling z różnymi interwałami
- [ ] Opcjonalnie: Dodaj WebSocket dla real-time aktualizacji

## WebSocket (Alternatywa)

Dla real-time aktualizacji bez pollingu:

```typescript
useEffect(() => {
  if (!jobId || status !== "running") return;
  
  const ws = new WebSocket(`wss://api.example.com/ws/jobs/${jobId}`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    setProgress(data.progress);
    setProcessedRecords(data.processed_records);
    setTotalRecords(data.total_records);
    setEta(data.eta);
  };
  
  return () => ws.close();
}, [jobId, status]);
```

## Stylizacja

Komponent `ProgressIndicator` używa semantycznych tokenów z design systemu:

- `bg-primary` - Kolor paska postępu (aktywny)
- `bg-yellow-500` - Kolor paska postępu (wstrzymany)
- `bg-green-500` - Kolor paska postępu (ukończony)
- `bg-muted/50` - Tło toru paska

Efekty wizualne:
- Animowany gradient "shine" podczas działania
- Efekt glow pod paskiem
- Płynna animacja przejścia szerokości
