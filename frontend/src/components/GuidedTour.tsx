"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_DONE_KEY = "fl-tour-done";

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
      title: "Tutor Notes",
      description: "In ogni paper del tipo 'My Manuscript', trovi il Review Journal. Clicca il bottone '+ Add Tutor Note' per lasciare le tue osservazioni e feedback. Le tue note saranno evidenziate in giallo e visibili a tutto il team.",
    },
  },
  {
    popover: {
      title: "Tour completato!",
      description: "Puoi riavviare questo tour in qualsiasi momento dalla pagina About. Buon lavoro!",
    },
  },
];

export default function GuidedTour() {
  const { user, isAdmin } = useAuth();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  // Only run on dashboard, only for tutor/viewer, only once
  useEffect(() => {
    if (!user || isAdmin) return;
    if (pathname !== "/") return;
    if (localStorage.getItem(TOUR_DONE_KEY)) return;
    // Small delay to let sidebar render
    const t = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(t);
  }, [user, isAdmin, pathname]);

  useEffect(() => {
    if (!ready) return;

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
      steps: TUTOR_STEPS,
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_DONE_KEY, "1");
        d.destroy();
      },
    });

    d.drive();
    setReady(false);
  }, [ready]);

  return null;
}

export function restartTour() {
  localStorage.removeItem(TOUR_DONE_KEY);
  window.location.href = "/";
}
