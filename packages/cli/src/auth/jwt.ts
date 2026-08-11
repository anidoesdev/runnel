import { SignJWT, jwtVerify } from 'jose';

export interface ISessionPayload {
  sub: string;
  email: string;
}

export async function signSessionToken(
  payload: ISessionPayload,
  secret: Uint8Array,
  expiresIn = '7d',
): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifySessionToken(token: string, secret: Uint8Array): Promise<ISessionPayload> {
  const { payload } = await jwtVerify(token, secret);
  return { sub: payload.sub as string, email: payload.email as string };
}
