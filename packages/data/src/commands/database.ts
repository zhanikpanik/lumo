/** The transaction surface required by shared domain commands.
 *  Framework-agnostic — satisfied by @instantdb/react, @instantdb/react-native,
 *  and @instantdb/admin. Uses `any` for chunks because the three packages have
 *  subtly different TransactionChunk types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CommandDatabase {
  transact(chunks: any[]): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: Record<string, Record<string, any>>;
}
