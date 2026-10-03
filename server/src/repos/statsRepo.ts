/**
 * Stats repository — JOIN + GROUP BY aggregates for the Vault dashboard.
 * Four independent aggregate queries run in parallel over the pool.
 */
import { query } from '../db.js';

export interface StatsDto {
  totals: {
    users: number;
    instructors: number;
    learners: number;
    courses: number;
    enrollments: number;
    activeEnrollments: number;
  };
  coursesPerLevel: { level: string; count: number }[];
  fillRate: { totalSeats: number; activeEnrollments: number; fillRatePct: number };
  topCourses: { id: string; title: string; level: string; enrolledCount: number }[];
}

export async function getStats(): Promise<StatsDto> {
  const [totalsRes, perLevelRes, fillRes, topRes] = await Promise.all([
    query<{
      users: string;
      instructors: string;
      learners: string;
      courses: string;
      enrollments: string;
      active_enrollments: string;
    }>(
      `SELECT ` +
        `(SELECT COUNT(*) FROM users) AS users, ` +
        `(SELECT COUNT(*) FROM users WHERE role = 'instructor') AS instructors, ` +
        `(SELECT COUNT(*) FROM users WHERE role = 'learner') AS learners, ` +
        `(SELECT COUNT(*) FROM courses) AS courses, ` +
        `(SELECT COUNT(*) FROM enrollments) AS enrollments, ` +
        `(SELECT COUNT(*) FROM enrollments WHERE status = 'active') AS active_enrollments`,
    ),
    query<{ level: string; count: string }>(
      `SELECT level, COUNT(*) AS count FROM courses GROUP BY level ORDER BY level ASC`,
    ),
    query<{ total_seats: string; active_enrollments: string }>(
      `SELECT COALESCE(SUM(seats), 0) AS total_seats, ` +
        `(SELECT COUNT(*) FROM enrollments WHERE status = 'active') AS active_enrollments ` +
        `FROM courses`,
    ),
    query<{ id: string; title: string; level: string; enrolled_count: string }>(
      `SELECT c.id, c.title, c.level, COUNT(e.user_id) AS enrolled_count ` +
        `FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id AND e.status = 'active' ` +
        `GROUP BY c.id ORDER BY enrolled_count DESC, c.title ASC LIMIT 5`,
    ),
  ]);

  const totals = totalsRes.rows[0] as {
    users: string;
    instructors: string;
    learners: string;
    courses: string;
    enrollments: string;
    active_enrollments: string;
  };
  const fill = fillRes.rows[0] as { total_seats: string; active_enrollments: string };
  const totalSeats = Number(fill.total_seats);
  const activeEnrollments = Number(fill.active_enrollments);

  return {
    totals: {
      users: Number(totals.users),
      instructors: Number(totals.instructors),
      learners: Number(totals.learners),
      courses: Number(totals.courses),
      enrollments: Number(totals.enrollments),
      activeEnrollments: Number(totals.active_enrollments),
    },
    coursesPerLevel: perLevelRes.rows.map((r) => ({
      level: r.level,
      count: Number(r.count),
    })),
    fillRate: {
      totalSeats,
      activeEnrollments,
      fillRatePct: totalSeats === 0 ? 0 : Math.round((activeEnrollments / totalSeats) * 1000) / 10,
    },
    topCourses: topRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      level: r.level,
      enrolledCount: Number(r.enrolled_count),
    })),
  };
}
