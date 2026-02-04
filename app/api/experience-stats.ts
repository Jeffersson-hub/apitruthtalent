// pages/api/experience-stats.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../utils/supabase";

// Types pour les données
interface CandidatExperience {
  annees_experience: number | null;
  id?: number;
  nom?: string;
  prenom?: string;
  postes?: string[];
}

interface DistributionItem {
  range: string;
  count: number;
  percentage: number;
}

interface TopCandidat {
  id: number;
  nom: string | null;
  prenom: string | null;
  annees_experience: number | null;
  postes: string[] | null;
}

interface StatsResponse {
  success: boolean;
  stats: {
    total_candidats: number;
    moyenne: number;
    min: number;
    max: number;
    mediane: number;
  };
  distribution: DistributionItem[];
  top_experiences: TopCandidat[];
  timestamp: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatsResponse | { success: false; error: string; timestamp: string }>,
) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ 
      success: false,
      error: "Méthode non autorisée",
      timestamp: new Date().toISOString()
    });
  }

  try {
    console.log("📊 Récupération des statistiques d'expérience");

    // 1. Statistiques générales
    const { data: stats, error: statsError } = await supabase
      .from("candidats")
      .select("annees_experience")
      .not("annees_experience", "is", null);

    if (statsError) throw statsError;

    // Calcul des statistiques
    const experiences = stats
      ?.map((s: CandidatExperience) => s.annees_experience)
      .filter((exp: number | null): exp is number => exp !== null && !isNaN(exp)) || [];

    const statsCalculated = {
      total_candidats: experiences.length,
      moyenne:
        experiences.length > 0
          ? Math.round(
              (experiences.reduce((a: number, b: number) => a + b, 0) / experiences.length) *
                10,
            ) / 10
          : 0,
      min: experiences.length > 0 ? Math.min(...experiences) : 0,
      max: experiences.length > 0 ? Math.max(...experiences) : 0,
      mediane: experiences.length > 0 ? calculateMedian(experiences) : 0,
    };

    // 2. Distribution par niveau
    const { data: distribution, error: distError } = await supabase.rpc(
      "get_experience_distribution",
    );

    // Si la fonction RPC n'existe pas, on la calcule manuellement
    let distributionData: DistributionItem[];
    if (distError) {
      console.warn("Fonction RPC non disponible, calcul manuel:", distError.message);
      distributionData = calculateDistribution(experiences);
    } else {
      distributionData = distribution || calculateDistribution(experiences);
    }

    // 3. Top des expériences
    const { data: topCandidats } = await supabase
      .from("candidats")
      .select("id, nom, prenom, annees_experience, postes")
      .not("annees_experience", "is", null)
      .order("annees_experience", { ascending: false })
      .limit(10);

    const topCandidatsTyped: TopCandidat[] = (topCandidats || []).map((c: any) => ({
      id: c.id || 0,
      nom: c.nom || null,
      prenom: c.prenom || null,
      annees_experience: c.annees_experience || null,
      postes: c.postes || null,
    }));

    return res.status(200).json({
      success: true,
      stats: statsCalculated,
      distribution: distributionData,
      top_experiences: topCandidatsTyped,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("💥 Erreur stats expérience:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erreur inconnue",
      timestamp: new Date().toISOString(),
    });
  }
}

// Fonctions utilitaires avec types explicites
function calculateMedian(numbers: number[]): number {
  const sorted = [...numbers].sort((a: number, b: number) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function calculateDistribution(experiences: number[]): DistributionItem[] {
  const ranges = [
    { label: "0-2 ans", min: 0, max: 2 },
    { label: "3-5 ans", min: 3, max: 5 },
    { label: "6-10 ans", min: 6, max: 10 },
    { label: "11-15 ans", min: 11, max: 15 },
    { label: "15+ ans", min: 15, max: 999 },
  ];

  return ranges.map((range) => {
    const count = experiences.filter(
      (exp: number) => exp >= range.min && exp <= range.max,
    ).length;

    return {
      range: range.label,
      count,
      percentage:
        experiences.length > 0
          ? Math.round((count / experiences.length) * 1000) / 10
          : 0,
    };
  });
}