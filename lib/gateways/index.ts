import { cashfree } from './cashfree';
import { razorpay } from './razorpay';
import type { Gateway, GatewayId } from './types';

const gateways: Record<GatewayId, Gateway> = { razorpay, cashfree };

export const isGatewayId = (id: unknown): id is GatewayId => typeof id === 'string' && Object.prototype.hasOwnProperty.call(gateways, id);
export const getGateway = (id: GatewayId): Gateway => gateways[id];
export * from './types';
