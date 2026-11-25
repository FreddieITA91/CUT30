# CUT30 — Personal Fitness

Web app (PWA) per alimentazione, allenamenti, calendario e progressi, con sincronizzazione opzionale su Google Sheets.

Il repository contiene solo codice pubblico: il diario personale resta nell'archivio Google Sheets privato.

## Pubblicazione
Settings → Pages → Deploy from a branch → main → / (root).

## Sincronizzazione
Per l'accesso al diario cloud occorre configurare Google OAuth come Web application, abilitare Google Sheets API e aggiungere `https://freddieita91.github.io` agli Authorized JavaScript origins. Inserire il Client ID pubblico nelle Impostazioni della PWA. Non inserire token o client secret nel repository.

La PWA è local-first: funziona nel browser e sincronizza con il foglio privato solo dopo autorizzazione. Il collegamento della chat al medesimo foglio consente di registrare dati da ChatGPT e recuperarli nell'app con Sincronizza.

## Funzioni
- Dashboard, grafici macro, passi e cardio
- Diario alimentare e catalogo
- Schede e checklist allenamento
- Calendario e progressi muscolari
- Backup JSON e modalità offline

## CUT30 Engine 2.1 (nuovo)

Il motore analitico ha funzioni deterministiche (senza inferenze AI) e test automatizzati:

- Report dell'attività negli ultimi 14 giorni, verifica copertura del diario alimentare, trend pesate PRE e conteggio serie/voti.
- Nuova sezione nelle pagine **Progressi** e **Allenamento**: accesso a Carichi, Valutazioni e, se presente, AnalisiAuto.
- Inserimento di singole serie (palestra, identificativo attrezzo, kg e ripetizioni): scrittura mirata e verifica sul foglio privato.
- Calcolatore ricette: ingredienti e valori nutrizionali per 100 g, peso totale COTTO della preparazione e peso della porzione COTTA. Se manca la resa cotta, non inventa le kcal della porzione.
- Sincronizzazione PWA differenziale: aggiorna/aggiunge solo record necessari, preserva le altre schede e blocca i conflitti rilevati.
- **GitHub Actions** esegue test automatici e può produrre un riepilogo giornaliero privato nel tab AnalisiAuto dopo configurazione delle credenziali server-side.

Le credenziali del report giornaliero vanno inserite **solo** in GitHub Actions Secrets, mai nel repository. Dettagli in [docs/ENGINE_V1.md](docs/ENGINE_V1.md).

Il motore non sostituisce le valutazioni personalizzate del PT. I dati stimati del tracker non sono calorie realmente consumate con certezza e non equivalgono al deficit energetico. Le schede automatiche sono bozze, mai sessioni già eseguite.

**Stato deployment:** la parte locale/PWA e i test sono indipendenti dalla configurazione privata. Il job giornaliero non può leggere i dati reali finché non è autorizzato il service account.
