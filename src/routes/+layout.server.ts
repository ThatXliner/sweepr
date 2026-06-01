import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { getSession }, cookies }) => {
	return {
		session: await getSession(),
		cookies: cookies.getAll()
	};
};
