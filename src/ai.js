'use strict';

/**
 * @fileoverview TeamFlow AI Engine — Workload-aware recommendation system.
 *
 * This module provides the scoring and reasoning logic for task assignee
 * suggestions using a multi-factor heuristic model.
 */

const cfg = require('./config');

/**
 * Scores team members based on skills, task title keywords, and current workload.
 *
 * @param {string} title      - The title of the task to be assigned.
 * @param {string} tag        - The category tag of the task.
 * @param {Object} analytics - Current team analytics including workload by member.
 * @returns {Array<Object>} Sorted list of team members with their scores.
 */
function scoreMembers(title, tag, analytics) {
  const titleLower = (title || '').toLowerCase();
  return cfg.TEAM_MEMBERS
    .map(m => {
      // 1. Calculate current workload from analytics
      const load = analytics.byMember[m.name]?.total || 0;

      // 2. Skill match bonus: Higher weight if member is a specialist in this tag
      const skillMatch = m.skills.includes(tag) ? cfg.AI_SKILL_MATCH_BONUS : 0;

      // 3. Keyword match bonus: Bonus if task title mentions any of their expertises
      const keywordMatch = m.skills.some(s => titleLower.includes(s)) ? 1 : 0;

      // 4. Load score: Inverse of current load (max score - current tasks)
      const loadScore = Math.max(0, cfg.AI_LOAD_MAX_SCORE - load);

      return {
        ...m,
        load,
        score: skillMatch + keywordMatch + loadScore
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Builds a human-readable explanation for why a specific member was recommended.
 *
 * @param {Object} member - The team member object.
 * @param {string} tag    - The task category tag.
 * @param {string} title  - The task title.
 * @returns {string} A descriptive reason string.
 */
function buildReason(member, tag, title) {
  const parts = [];

  // Specialization check
  if (member.skills.includes(tag)) {
    parts.push(`${member.name} specialises in ${tag} tasks`);
  }

  // Keyword check
  const titleLower = (title || '').toLowerCase();
  const matchedSkill = member.skills.find(s => s !== tag && titleLower.includes(s));
  if (matchedSkill) {
    parts.push(`the task mentions ${matchedSkill} which matches their expertise`);
  }

  // Workload check
  parts.push(`they currently have the lowest workload (${member.load} active task${member.load !== 1 ? 's' : ''})`);

  // Join parts naturally
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`
    : `${parts[0]}.`;
}

module.exports = {
  scoreMembers,
  buildReason
};
