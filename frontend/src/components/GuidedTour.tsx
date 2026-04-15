"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_DONE_KEY = "fl-tour-done";
const TOUR_MANUSCRIPT_KEY = "fl-tour-manuscript-done";

// --- Tour 1: Sidebar overview (Dashboard) ---
const TUTOR_STEPS = [
  {
    element: "[data-tour='sidebar']",
    popover: {
      title: "Benvenuto in FL Research Monitor!",
      description: "Questa è la barra di navigazione. Da qui accedi a tutte le sezioni del sistema. Ti guido in un breve tour delle funzionalità principali.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='dashboard']",
    popover: {
      title: "Dashboard",
      description: "Panoramica del sistema: metriche globali, paper recenti, timeline delle pubblicazioni e distribuzione per fonte.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='papers']",
    popover: {
      title: "Papers",
      description: "La bibliografia completa. Qui puoi consultare tutti i paper, leggere abstract e analisi, e filtrare per topic, label o keyword.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='review']",
    popover: {
      title: "Meta Review",
      description: "Qui trovi gli Extended Abstract generati per ogni paper. Puoi leggerli e consultarli come sintesi strutturate.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='peer-review']",
    popover: {
      title: "Peer Review",
      description: "Le peer review ricevute sui manoscritti sottomessi a journal e conferenze. Puoi consultare rubric, punteggi e commenti dei reviewer.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='my-manuscripts']",
    popover: {
      title: "My Manuscripts",
      description: "I manoscritti in lavorazione. Qui puoi visualizzare il PDF, consultare la timeline delle submission e — importante — lasciare le tue note nel Review Journal.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='paper-quality']",
    popover: {
      title: "Quality Review",
      description: "Valutazioni di qualità scientifica dei paper nella bibliografia. Ogni paper viene valutato su 10 dimensioni con punteggio e commenti.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='comparison']",
    popover: {
      title: "Comparison",
      description: "Confronto strutturato tra paper. Puoi analizzare side-by-side metodi, risultati, tecniche FL, dataset e limitazioni.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='reports']",
    popover: {
      title: "Reports",
      description: "Report giornalieri e analisi individuali dei paper. Puoi consultare e scaricare i report generati.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='settings']",
    popover: {
      title: "Settings",
      description: "Da qui puoi cambiare la tua password. Le altre funzioni di configurazione sono riservate all'amministratore.",
      side: "right" as const,
    },
  },
  {
    popover: {
      title: "Tour completato!",
      description: "Ora vai su My Manuscripts per un tour dedicato alle funzioni del manoscritto. Puoi riavviare questo tour dalla pagina About.",
    },
  },
];

// --- Tour 2: My Manuscripts detail page ---
const MANUSCRIPT_STEPS = [
  {
    popover: {
      title: "Pagina Manoscritto",
      description: "Questa è la pagina di dettaglio del tuo manoscritto. Qui trovi il documento, la timeline delle submission, il Review Journal e la bibliografia. Ti mostro le sezioni principali.",
    },
  },
  {
    element: "[data-tour='ms-toolbar']",
    popover: {
      title: "Toolbar Documento",
      description: "Da qui l'amministratore può caricare il PDF del manoscritto e i file sorgente (.tex, .md). Se è configurato un progetto Overleaf, trovi il link diretto.",
      side: "bottom" as const,
    },
  },
  {
    element: "[data-tour='ms-pdf']",
    popover: {
      title: "Visualizzatore PDF",
      description: "Qui puoi leggere il PDF del manoscritto direttamente nel browser. Il PDF viene aggiornato automaticamente quando l'amministratore carica una nuova versione.",
      side: "right" as const,
    },
  },
  {
    element: "[data-tour='ms-timeline']",
    popover: {
      title: "Submission Timeline",
      description: "La timeline traccia tutte le sottomissioni: round, deadline, decisioni dei reviewer. Puoi vedere lo stato di avanzamento del processo di pubblicazione.",
      side: "left" as const,
    },
  },
  {
    element: "[data-tour='ms-journal']",
    popover: {
      title: "Review Journal",
      description: "Qui trovi il feedback dei reviewer e le osservazioni strutturate. Come tutor, puoi aggiungere le tue note cliccando '+ Add Tutor Note'.",
      side: "left" as const,
    },
  },
  {
    popover: {
      title: "Come aggiungere una Tutor Note",
      description: "1. Clicca '+ Add Tutor Note' (bottone blu)\n2. Inserisci il tuo nome e il testo della nota\n3. Clicca 'Add Note'\n4. Espandi la nota e clicca 'Edit' per aggiungere osservazioni strutturate con severity (major, minor, suggestion, praise)\n5. Le tue note saranno evidenziate in giallo.",
    },
  },
  {
    element: "[data-tour='ms-bibliography']",
    popover: {
      title: "Bibliografia",
      description: "L'elenco dei paper citati nel manoscritto. Puoi consultare la lista, filtrare per keyword o label, e scaricare in formato TXT, BIB o CSV.",
      side: "left" as const,
    },
  },
  {
    popover: {
      title: "Tour Manoscritto completato!",
      description: "Ora conosci tutte le funzionalità della pagina manoscritto. Puoi riavviare i tour dalla pagina About.",
    },
  },
];

type TourStep = { element?: string; popover: { title: string; description: string; side?: "top" | "bottom" | "left" | "right" } };

function runTour(steps: TourStep[], doneKey: string) {
  const d = driver({
    showProgress: true,
    animate: true,
    overlayColor: "rgba(0, 0, 0, 0.75)",
    stagePadding: 8,
    stageRadius: 12,
    popoverClass: "fl-tour-popover",
    nextBtnText: "Avanti",
    prevBtnText: "Indietro",
    doneBtnText: "Fine",
    progressText: "{{current}} di {{total}}",
    steps,
    onDestroyStarted: () => {
      localStorage.setItem(doneKey, "1");
      d.destroy();
    },
  });
  d.drive();
}

export default function GuidedTour() {
  const { user, isAdmin } = useAuth();
  const pathname = usePathname();
  const [ready, setReady] = useState<"sidebar" | "manuscript" | null>(null);

  useEffect(() => {
    if (!user) return;

    // Tour 1: Sidebar (on Dashboard)
    // Auto-start only for tutor/viewer; admin can trigger via Restart
    if (pathname === "/" && !localStorage.getItem(TOUR_DONE_KEY)) {
      if (!isAdmin) {
        const t = setTimeout(() => setReady("sidebar"), 800);
        return () => clearTimeout(t);
      }
    }

    // Tour 2: Manuscript detail page
    // Runs for ALL roles when localStorage key is absent (manual restart or first visit for tutor)
    if (pathname.startsWith("/my-manuscripts/") && pathname !== "/my-manuscripts" && !localStorage.getItem(TOUR_MANUSCRIPT_KEY)) {
      const t = setTimeout(() => setReady("manuscript"), 1000);
      return () => clearTimeout(t);
    }
  }, [user, isAdmin, pathname]);

  useEffect(() => {
    if (!ready) return;
    if (ready === "sidebar") runTour(TUTOR_STEPS, TOUR_DONE_KEY);
    if (ready === "manuscript") runTour(MANUSCRIPT_STEPS, TOUR_MANUSCRIPT_KEY);
    setReady(null);
  }, [ready]);

  return null;
}

export function restartTour() {
  localStorage.removeItem(TOUR_DONE_KEY);
  window.location.href = "/";
}

export function restartManuscriptTour() {
  localStorage.removeItem(TOUR_MANUSCRIPT_KEY);
  window.location.reload();
}
