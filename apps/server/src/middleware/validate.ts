import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { HTTP_STATUS, ERROR_CODES } from '@uno-ultimate/shared';

export function validateBody(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError || (error as Error).name === 'ZodError') {
        const zodErr = error as ZodError;
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid request data.',
            details: zodErr.errors?.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })) || [{ message: (error as Error).message }],
          },
        });
        return;
      }
      next(error);
    }
  };
}
