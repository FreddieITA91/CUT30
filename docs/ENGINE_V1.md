# CUT30 Engine v1 — automazione privata

## Architettura
- **Web app CUT30**: ingresso dati manuale e lettura, OAuth Google esistente.
- **Google Sheets privato**: fonte unica dei dati; dati personali mai pubblicati nel repository GitHub pubblico.
- **Motore JS**: statistiche deterministiche, controlli qualità, workout canonici, andamento PRE, bozze schede.
- **GitHub Actions**: test continui e report giornaliero su un nuovo tab privato AnalisiAuto.
- **ChatGPT**: consulta lo stesso Google Sheet tramite connettore per intervenire da PT e supporto nutrizionale, senza ricomputare manualmente i totali.

## Stato
- Motore, test, cron e writer Google Sheets implementati nel ramo di lavoro.
- **Non ancora in produzione**: occorrono credenziali GitHub Actions, PR approvata/merge, collaudo e interfaccia PWA.
- La PWA attuale non mostra ancora Carichi e Valutazioni né il report AnalisiAuto; non è stata modificata in questa fase.

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
1. Mostrare AnalisiAuto, Carichi e Valutazioni nella PWA con refresh non distruttivo.
2. Scrittura idempotente dei singoli esercizi, set e pasti, con audit e correzioni.
3. Distinzione FC di sala pesi e cardio, durata, passi, distanza e target cardiaco.
4. Modulo ricette: ingredienti a crudo, resa finale, porzione pesata, valori etichetta.
5. Generatore scheda automatico basato su disponibilità palestra, recupero, dati carichi e tempi.
6. Report trend 7/14/30 giorni, alert di qualità e notifiche.

Per accesso multiutente e transazioni ad alta frequenza sarà opportuno passare a un database con API e autenticazione dedicate, mantenendo GitHub Actions per calcolo periodico, non come database.
