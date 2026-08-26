-- Site-wide lock: when enabled, every signed-in non-admin user is bounced
-- to /locked on their next page load (checked live in the root layout, not
-- baked into the JWT — so it takes effect immediately for users who are
-- already logged in, not just new logins). Admins are never affected.
-- Singleton row (id always 1) — toggled from the admin panel.

create table if not exists app_settings (
  id integer primary key default 1 check (id = 1),
  site_locked boolean not null default false,
  locked_by uuid references users(id),
  locked_at timestamptz
);

insert into app_settings (id) values (1) on conflict (id) do nothing;
