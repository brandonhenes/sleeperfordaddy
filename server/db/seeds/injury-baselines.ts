import { db } from "../connection.js";
import { injury_recovery_baselines } from "../schema.js";

const BASELINES = [
  // ACL
  { injury_type: "ACL", position: "ALL", avg_weeks_out: 42, min_weeks: 36, max_weeks: 52 },
  // Achilles
  { injury_type: "Achilles", position: "ALL", avg_weeks_out: 44, min_weeks: 36, max_weeks: 52 },
  // MCL Grade 2-3
  { injury_type: "MCL", position: "ALL", avg_weeks_out: 6, min_weeks: 4, max_weeks: 8 },
  // Hamstring
  { injury_type: "Hamstring", position: "ALL", avg_weeks_out: 3, min_weeks: 2, max_weeks: 6 },
  // High Ankle Sprain
  { injury_type: "Ankle", position: "ALL", avg_weeks_out: 6, min_weeks: 4, max_weeks: 8 },
  // Shoulder (non-surgical)
  { injury_type: "Shoulder", position: "ALL", avg_weeks_out: 3, min_weeks: 2, max_weeks: 4 },
  // Concussion
  { injury_type: "Concussion", position: "ALL", avg_weeks_out: 2, min_weeks: 1, max_weeks: 3 },
  // Broken bone (hand/foot)
  { injury_type: "Hand", position: "ALL", avg_weeks_out: 6, min_weeks: 4, max_weeks: 8 },
  { injury_type: "Foot", position: "ALL", avg_weeks_out: 6, min_weeks: 4, max_weeks: 8 },
  // Broken bone (leg/arm)
  { injury_type: "Leg", position: "ALL", avg_weeks_out: 12, min_weeks: 8, max_weeks: 16 },
  // Knee (general, non-ACL)
  { injury_type: "Knee", position: "ALL", avg_weeks_out: 4, min_weeks: 2, max_weeks: 8 },
  // Back
  { injury_type: "Back", position: "ALL", avg_weeks_out: 3, min_weeks: 1, max_weeks: 6 },
  // Hip
  { injury_type: "Hip", position: "ALL", avg_weeks_out: 4, min_weeks: 2, max_weeks: 8 },
  // Ribs
  { injury_type: "Ribs", position: "ALL", avg_weeks_out: 3, min_weeks: 2, max_weeks: 6 },
  // Groin
  { injury_type: "Groin", position: "ALL", avg_weeks_out: 3, min_weeks: 2, max_weeks: 6 },
  // Calf
  { injury_type: "Calf", position: "ALL", avg_weeks_out: 3, min_weeks: 2, max_weeks: 5 },
  // Quad
  { injury_type: "Quad", position: "ALL", avg_weeks_out: 3, min_weeks: 2, max_weeks: 5 },
  // Elbow
  { injury_type: "Elbow", position: "ALL", avg_weeks_out: 4, min_weeks: 2, max_weeks: 8 },
  // Wrist
  { injury_type: "Wrist", position: "ALL", avg_weeks_out: 4, min_weeks: 2, max_weeks: 6 },
  // Neck
  { injury_type: "Neck", position: "ALL", avg_weeks_out: 3, min_weeks: 1, max_weeks: 6 },
  // Abdomen
  { injury_type: "Abdomen", position: "ALL", avg_weeks_out: 4, min_weeks: 2, max_weeks: 8 },
  // Toe/Turf Toe
  { injury_type: "Toe", position: "ALL", avg_weeks_out: 4, min_weeks: 2, max_weeks: 8 },
  // Thumb
  { injury_type: "Thumb", position: "ALL", avg_weeks_out: 4, min_weeks: 2, max_weeks: 6 },
];

export async function seedInjuryBaselines() {
  await db
    .insert(injury_recovery_baselines)
    .values(BASELINES)
    .onConflictDoUpdate({
      target: [injury_recovery_baselines.injury_type, injury_recovery_baselines.position],
      set: {
        avg_weeks_out: injury_recovery_baselines.avg_weeks_out,
        min_weeks: injury_recovery_baselines.min_weeks,
        max_weeks: injury_recovery_baselines.max_weeks,
      },
    });
}
