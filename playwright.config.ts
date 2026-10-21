import type { PlaywrightTestConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

const config: PlaywrightTestConfig = {
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: `npm run build && npm run preview --host 127.0.0.1 --port ${port} --strictPort`,
				url: baseURL
			},
	use: { baseURL },
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/
};

export default config;
