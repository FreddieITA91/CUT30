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
