# CUT30 Engine v1 — automazione privata

## Architettura
- **Web app CUT30**: ingresso dati manuale e lettura, OAuth Google esistente.
- **Google Sheets privato**: fonte unica dei dati; dati personali mai pubblicati nel repository GitHub pubblico.
- **Motore JS**: statistiche deterministiche, controlli qualità, workout canonici, andamento PRE, bozze schede.
- **GitHub Actions**: test continui e report giornaliero su un nuovo tab privato AnalisiAuto.
- **ChatGPT**: consulta lo stesso Google Sheet tramite connettore per intervenire da PT e supporto nutrizionale, senza ricomputare manualmente i totali.

## Stato
- Motore, test, cron e writer Google Sheets implementati nel ramo di lavoro.
- Il codice della PWA include pannelli per Carichi/Valutazioni, calcolatore ricette e salvataggio puntuale delle serie dopo accesso OAuth.
- La sincronizzazione dell'app ora usa aggiornamenti per riga/ID con verifica; non riscrive intere tabelle.
- Il **report programmato** non è operativo fino a configurazione delle credenziali di GitHub Actions e collaudo sul foglio reale.

## Configurazione sicura una tantum
1. In Google Cloud abilitare la Google Sheets API e creare un service account con chiave JSON.
2. Condividere **solo** il Google Sheet privato CUT30 con l'e-mail del service account come Editor.
3. In GitHub -> repository CUT30 -> Settings -> Secrets and variables -> Actions, creare:
   - CUT30_GOOGLE_SERVICE_ACCOUNT_JSON: testo integrale della chiave JSON.
   - CUT30_SPREADSHEET_ID: ID del foglio privato.
4. Non incollare credenziali in chat, codice pubblico, commit o screenshot.
5. Dopo il merge, eseguire manualmente Actions -> CUT30 Engine — Test & Daily Analytics -> Run workflow.
6. Verificare che il nuovo tab AnalisiAuto contenga la data e le metriche calcolate senza anomalie.

Il cron è alle 07:20 UTC (08:20 a Roma in inverno, 09:20 in estate); l'esecuzione può slittare. Non equivale a una registrazione in tempo reale. La registrazione diretta resta sull'app con OAuth.

## Invarianti e sicurezza
- Se mancano i secrets, il report automatico segnala DISABLED e **non legge o scrive dati**.
- Dati grezzi e credenziali non vengono salvati nel repository né stampati nei log.
- AnalisiAuto si aggiorna per data senza duplicare la stessa giornata.
- Record di allenamento privi di metriche reali sono ignorati; in_corso non conta come completato.
- Calorie stimate dal tracker non sono deficit energetico.
- Per la tendenza del peso si considerano soltanto misure PRE comparabili: almeno tre su almeno sette giorni.
- Per i carichi serve identificare la palestra/macchina: nessuna progressione fittizia.
- Le calorie di cibi da foto richiedono conferma o stima etichettata; non vengono inventate.
- Le bozze allenamento non sono mai inserite fra le sessioni eseguite.

## Roadmap prioritaria
1. **Attivato nel codice:** viste per Carichi e Valutazioni, ricette e aggiornamento mirato.
2. **Da attivare:** credenziali del report giornaliero, collaudo finale su AnalisiAuto.
3. **Da sviluppare:** registrazione segmentata della frequenza cardiaca (sala pesi/cardio), disponibilità palestra e attrezzi, RIR/RPE e media FC obiettivo.
4. **Da sviluppare:** generazione schede complete con progressioni comparabili per macchina e fotografie dimostrative; attualmente solo bozza automatica.
5. **Da sviluppare:** catalogo alimentare verificato per compilare ingredienti automaticamente, input etichetta/scansione, edit ricette registrate e audit.
6. **Da sviluppare:** notifiche, report 7/14/30 giorni, sincronizzazione offline più robusta e gestione conflitti guidata.

Per accesso multiutente e transazioni ad alta frequenza sarà opportuno passare a un database con API e autenticazione dedicate, mantenendo GitHub Actions per calcolo periodico, non come database.

## Schede calendarizzate (2.2)
La bozza usa il programma effettivo del calendario PWA; in assenza di override usa il ciclo settimanale dalla data di inizio. Le sedute saltate non producono sostituzioni automatiche. Ogni fase cardio ha durata, FC media indicativa, intervallo, velocità e pendenza modificabili durante l'esecuzione. Le sedute già concluse sono segnalate e non vanno ripetute automaticamente. Le durate sono valori di partenza, non prescrizioni individuali validate; la progressione personalizzata per attrezzo resta da sviluppare. Nessuna bozza scrive dati personali o sessioni svolte.

## Progressione dallo storico (2.3)
Il motore seleziona sedute concluse precedenti dello stesso programma e mostra gli ultimi tre volumi cardio; non cambia il calendario o il target in base a una seduta incompleta. Per i pesi confronta solo esercizio, palestra, attrezzo e unità identificati; le serie non comparabili restano nel diario ma non guidano incrementi. Il riferimento è la serie più pesante dell'ultima data, non necessariamente allenante. Una ripetizione aggiuntiva allo stesso carico è un obiettivo condizionato entro il range della scheda e con almeno 2 RIR, tecnica stabile e recupero adeguato. Nessun aumento automatico in kg, nessun RIR dedotto. I dati non escono dal browser o dal foglio privato; test sintetici.

## Cardio segmentato (2.4)
Il tab privato CardioSegmenti è creato dalla PWA al primo salvataggio autorizzato. Un ID deterministico per data e numero segmento consente correzioni esplicite, verifica dopo scrittura e rilevazione duplicati. Durata obbligatoria; distanza, ritmo nuoto (secondi/100 m), velocità, pendenza, calorie tracker, FC e passi sono facoltativi. La FC media è ponderata solo sui minuti con dato; massima e altri totali parziali sono segnalati. Il dettaglio non viene sommato ad Allenamenti, né sovrascrive automaticamente un totale esistente: l'utente verifica la copertura e aggiorna il totale giornaliero una sola volta. I dati storici non vengono ricostruiti. La verifica cloud riduce ma non elimina le condizioni di gara fra client concorrenti; la PWA richiede accesso Google per scrivere. Test con dati sintetici.
