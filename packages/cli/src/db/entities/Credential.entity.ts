import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** `data` holds the JSON-stringified IEncryptedCredentialData (iv/authTag/ciphertext) from @n8n-clone/core's encryption module — the plaintext credential values never touch this table. */
@Entity({ name: 'credential' })
export class CredentialEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  /** The credential *type* name, e.g. "httpBasicAuth" — matches ICredentialType.name. */
  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'text' })
  data!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
