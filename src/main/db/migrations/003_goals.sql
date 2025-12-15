-- Migration: 003_goals
-- Description: Goals table for tracking user objectives and autonomous processing

-- Goals table for user objectives
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed'
  priority INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  -- Autonomous processing metadata
  autonomous_enabled INTEGER DEFAULT 0, -- SQLite boolean
  autonomous_started_at INTEGER,
  autonomous_completed_at INTEGER
);

-- Goal progress tracking for autonomous execution
CREATE TABLE IF NOT EXISTS goal_progress (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  step_type TEXT NOT NULL, -- 'plan' | 'execute' | 'verify'
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
  output TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

-- Index for faster goal queries
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at);
CREATE INDEX IF NOT EXISTS idx_goal_progress_goal_id ON goal_progress(goal_id);
