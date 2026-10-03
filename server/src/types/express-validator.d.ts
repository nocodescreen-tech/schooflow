declare module 'express-validator' {
  import { Request, Response, NextFunction, RequestHandler } from 'express';

  export interface ValidationError {
    type: string;
    msg: unknown;
    path?: string;
    location?: string;
    value?: unknown;
  }

  export interface ValidationResult {
    isEmpty(): boolean;
    array(): ValidationError[];
    mapped(): Record<string, ValidationError>;
    formatWith(formatter: (error: ValidationError) => unknown): unknown;
  }

  export interface ValidationChain extends RequestHandler {
    not(): ValidationChain;
    optional(options?: boolean | { checkFalsy?: boolean; nullable?: boolean }): ValidationChain;
    custom(validator: (value: unknown, meta: { req: Request; path: string; location: string }) => unknown): ValidationChain;
    isEmail(): ValidationChain;
    normalizeEmail(): ValidationChain;
    isLength(options: { min?: number; max?: number }): ValidationChain;
    notEmpty(): ValidationChain;
    trim(): ValidationChain;
    isIn(values: unknown[]): ValidationChain;
    isFloat(options?: { min?: number; max?: number; lt?: number; gt?: number }): ValidationChain;
    isInt(options?: { min?: number; max?: number }): ValidationChain;
    isUUID(version?: string): ValidationChain;
    isISO8601(options?: { strict?: boolean }): ValidationChain;
    isArray(): ValidationChain;
    isString(): ValidationChain;
    isBoolean(): ValidationChain;
    isNumeric(options?: { no_symbols?: boolean; locale?: string }): ValidationChain;
    isDate(): ValidationChain;
    customSanitizer(sanitizer: (value: unknown) => unknown): ValidationChain;
    escape(): ValidationChain;
    toInt(): ValidationChain;
    toFloat(): ValidationChain;
    toBoolean(): ValidationChain;
    if(condition: (value: unknown) => boolean): ValidationChain;
    bail(): ValidationChain;
    withMessage(message: string): ValidationChain;
    run(req: Request): Promise<void>;
  }

  export interface FieldValidation {
    (field?: string | string[], message?: string): ValidationChain;
    (schema: Record<string, unknown>): ValidationChain;
  }

  export const body: FieldValidation;
  export const param: FieldValidation;
  export const query: FieldValidation;
  export const header: FieldValidation;
  export const cookie: FieldValidation;

  export function validationResult(req: Request): ValidationResult;

  export function matchedData(req: Request, options?: { locations?: string[]; onlyValidData?: boolean }): Record<string, unknown>;

  export function checkSchema(schema: Record<string, unknown>): ValidationChain[];
}
