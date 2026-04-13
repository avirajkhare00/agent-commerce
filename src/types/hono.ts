import type { Context } from "hono";

export type TenantVars = {
  tenantId: string;
};

export type HonoEnv = {
  Variables: TenantVars;
};

export type AppContext = Context<HonoEnv>;
