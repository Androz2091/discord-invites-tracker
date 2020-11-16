/// <reference types="node" />
import { EventEmitter } from 'events';
import type { Client, Snowflake, Invite, Guild, GuildMember } from 'discord.js';
import { Collection } from 'discord.js';
declare type JoinType = 'permissions' | 'normal' | 'vanity' | 'unknown';
declare interface InvitesTracker {
    on(event: 'cacheFetched', listener: () => void): this;
    on(event: 'guildMemberAdd', listener: (member: GuildMember, joinType: JoinType, usedInvite: Invite | null) => void): this;
}
interface ExemptGuildFunction {
    (guild: Guild): boolean;
}
interface InvitesTrackerOptions {
    fetchGuilds: boolean;
    fetchAuditLogs: boolean;
    fetchVanity: boolean;
    exemptGuild?: ExemptGuildFunction;
    activeGuilds?: Snowflake[];
}
interface VanityInvite {
    code: string;
    uses: number;
}
interface DeletedInvite extends Invite {
    deleted?: boolean;
    deletedTimestamp?: number;
}
declare type TrackedInvite = DeletedInvite & Invite;
declare class InvitesTracker extends EventEmitter {
    client: Client;
    options: Partial<InvitesTrackerOptions>;
    invitesCache: Collection<Snowflake, Collection<string, TrackedInvite>>;
    vanityInvitesCache: Collection<Snowflake, VanityInvite>;
    invitesCacheUpdates: Collection<Snowflake, number>;
    cacheFetched: boolean;
    constructor(client: Client, options: InvitesTrackerOptions);
    get guilds(): Collection<Snowflake, Guild>;
    private handleInviteCreate;
    private handleInviteDelete;
    /**
     * Emit quand un membre rejoint un serveur.
     * @param member Le membre qui a rejoint.
     */
    private handleGuildMemberAdd;
    private fetchGuildCache;
    fetchCache(): Promise<void>;
}
declare const _default: {
    init: (client: Client, options: InvitesTrackerOptions) => InvitesTracker;
};
export = _default;
