import { ListPaymentsParams, Payment } from '../types';
export interface PaymentRepository {
    create(payment: Payment): Payment;
    getById(id: string): Payment | null;
    update(id: string, updates: Partial<Payment>): Payment | null;
    list(filters?: ListPaymentsParams): Payment[];
}
export declare class SqlitePaymentRepository implements PaymentRepository {
    private readonly db;
    constructor(databasePath: string);
    create(payment: Payment): Payment;
    getById(id: string): Payment | null;
    update(id: string, updates: Partial<Payment>): Payment | null;
    list(filters?: ListPaymentsParams): Payment[];
}
//# sourceMappingURL=sqlite.d.ts.map