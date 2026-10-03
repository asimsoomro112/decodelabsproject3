-- CourseVault initial schema (Project 3: Database Integration).
-- Idempotent at the migration-runner level: tracked in schema_migrations.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('learner','instructor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio text CHECK (char_length(bio) <= 300),
  country text,
  age smallint CHECK (age BETWEEN 16 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  description text,
  level text NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
  seats int NOT NULL CHECK (seats BETWEEN 1 AND 500),
  start_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courses_instructor_title_unique UNIQUE (instructor_id, title)
);

CREATE TABLE enrollments (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','dropped')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE INDEX idx_courses_instructor_id ON courses (instructor_id);
CREATE INDEX idx_courses_start_date ON courses (start_date);
CREATE INDEX idx_enrollments_user_id ON enrollments (user_id);
CREATE INDEX idx_enrollments_course_id ON enrollments (course_id);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION ensure_instructor_role() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  SELECT role INTO r FROM users WHERE id = NEW.instructor_id;
  IF r IS NULL THEN RAISE EXCEPTION 'instructor % does not exist', NEW.instructor_id USING ERRCODE = '23503'; END IF;
  IF r <> 'instructor' THEN RAISE EXCEPTION 'user % has role %, not instructor', NEW.instructor_id, r USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_courses_instructor_role BEFORE INSERT OR UPDATE OF instructor_id ON courses FOR EACH ROW EXECUTE FUNCTION ensure_instructor_role();
