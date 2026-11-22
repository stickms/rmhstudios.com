import { z } from 'zod';

/** PUT body of the role endpoint: make (true) or unmake (false) the member an admin. */
export const setAdminBody =
  z.object(
    {
      admin:
        z.boolean(),
    },
  );
