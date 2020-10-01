import { EventEmitter } from 'events';
import type {
    Client, Snowflake, Invite, Guild, GuildMember
} from 'discord.js';
import {
    Collection, SnowflakeUtil
} from 'discord.js';

type JoinType = 'permissions' | 'normal' | 'vanity' | 'unknown';

declare interface InvitesTracker {
    on(event: 'cacheFetched', listener: () => void): this;
    on(event: 'guildMemberAdd', listener: (member: GuildMember, joinType: JoinType, usedInvite: Invite | null) => void): this;
}

interface ExemptGuildFunction {
    (guild: Guild): boolean
}

interface InvitesTrackerOptions {
    fetchGuilds: boolean;
    fetchAuditLogs: boolean;
    fetchVanity: boolean;
    exemptGuild?: ExemptGuildFunction;
    activeGuilds?: Snowflake[];
}

interface DeletedInvite extends Invite {
    deletedTimestamp?: number;
};

type TrackedInvite = DeletedInvite & Invite;

const compareInvitesCache = (cachedInvites: Collection<string, TrackedInvite>, currentInvites: Collection<string, TrackedInvite>): TrackedInvite[] => {
    const invitesUsed: Invite[] = [];
    currentInvites.forEach((invite) => {
        if (
            // ignore unused invites
            invite.uses !== 0
            && (
                // the invite was created after the cache synchronization
                !cachedInvites.has(invite.code)
                // the invite was used since the last cache synchronization
                || cachedInvites.get(invite.code).uses < invite.uses
            )
        ) {
            invitesUsed.push(invite);
        }
    });
    console.log(invitesUsed.length)
    if (invitesUsed.length < 1) {
        cachedInvites.sort((a, b) => (a.deletedTimestamp && b.deletedTimestamp) ? b.deletedTimestamp - a.deletedTimestamp : 0).forEach((invite) => {
            if (
                // if the invite was deleted
                !currentInvites.has(invite.code)
                // and it was about to be deleted
                && invite.uses === (invite.maxUses - 1)
            ) {
                invitesUsed.push(invite);
            }
        });
    }
    return invitesUsed;
};

class InvitesTracker extends EventEmitter {

    public client: Client;
    public options: Partial<InvitesTrackerOptions>;

    public invitesCache: Collection<Snowflake, Collection<string, TrackedInvite>>;
    public invitesCacheUpdates: Collection<Snowflake, number>;
    public cacheFetched: boolean;

    public vanityURLCache: Collection<Snowflake, string>;

    constructor(client: Client, options: InvitesTrackerOptions) {
        super();
        this.client = client;
        this.options = options;

        this.invitesCache = new Collection();
        this.invitesCacheUpdates = new Collection();
        this.cacheFetched = false;

        this.vanityURLCache = new Collection();

        if (this.client.readyAt) {
            this.fetchCache().then(() => {
                this.cacheFetched = true;
                this.emit('cacheFetched');
            });
        } else {
            this.client.on('ready', () => {
                this.fetchCache().then(() => {
                    this.cacheFetched = true;
                    this.emit('cacheFetched');
                });
            });
        }
        

        this.client.on('guildMemberAdd', (member) => this.handleGuildMemberAdd(member as GuildMember));
        this.client.on('inviteCreate', (invite) => this.handleInviteCreate(invite));
        this.client.on('inviteDelete', (invite) => this.handleInviteDelete(invite));
    }

    get guilds(): Collection<Snowflake, Guild> {
        let guilds = this.client.guilds.cache;
        if (this.options.exemptGuild) guilds = guilds.filter((g) => !this.options.exemptGuild(g));
        if (this.options.activeGuilds) guilds = guilds.filter((g) => this.options.activeGuilds.includes(g.id));
        return guilds;
    }

    private async handleInviteCreate (invite: TrackedInvite): Promise<void> {
        if(!this.invitesCache.get(invite.guild.id)) {
            await this.fetchGuildCache(invite.guild);
        }
        if (this.invitesCache.get(invite.guild.id)) {
            this.invitesCache.get(invite.guild.id).set(invite.code, invite);
        }
    }

    private async handleInviteDelete (invite: Invite): Promise<void> {
        const cachedInvites = this.invitesCache.get(invite.guild.id);
        if(cachedInvites) {
            if(cachedInvites.get(invite.code)) {
                cachedInvites.get(invite.code).deletedTimestamp = Date.now();
            }
        }
    }

    private async handleGuildMemberAdd(member: GuildMember): Promise<void> {
        if (member.partial) return;
        if (!this.guilds.has(member.guild.id)) return;

        // Fetch new guild invites
        const currentInvites = await member.guild.fetchInvites().catch(() => {});
        if (!currentInvites) {
            this.emit('guildMemberAdd', member, 'permissions', null);
            return;
        }
        // Retrieve cached guild invites
        const cachedInvites = this.invitesCache.get(member.guild.id);
        const lastCacheUpdate = this.invitesCacheUpdates.get(member.guild.id);
        // Update invites cache
        this.invitesCache.set(member.guild.id, currentInvites);
        this.invitesCacheUpdates.set(member.guild.id, Date.now());
        // If there was no cache for this guild we can't retrieve used invite
        if (!cachedInvites) {
            this.emit('guildMemberAdd', member, 'unknown', null);
            return;
        }

        let usedInvites = compareInvitesCache(cachedInvites, currentInvites);

        if (usedInvites.length === 0 && this.options.fetchAuditLogs && member.guild.me.hasPermission('VIEW_AUDIT_LOG')) {
            const logs = await member.guild.fetchAuditLogs({
                limit: 50,
                type: 'INVITE_CREATE'
            }).catch(() => {});
            if (logs && logs.entries.size > 0) {
                const createdInvites = logs.entries
                    .filter((e) => SnowflakeUtil.deconstruct(e.id).timestamp > lastCacheUpdate && !currentInvites.get(((e as any) as TrackedInvite).code))
                    .map((e) => e.target);
                usedInvites = usedInvites.concat(createdInvites as TrackedInvite[]);
            }
        }

        let isVanity = false;
        if (usedInvites.length === 0 && !member.guild.features.includes('VANITY_URL')) {
            const vanityURLCode = member.guild.vanityURLCode
                ?? this.vanityURLCache.get(member.guild.id)
                ?? await member.guild.fetchVanityCode();
            if (vanityURLCode) {
                isVanity = true;
            }
        }

        this.emit('guildMemberAdd', member, isVanity ? 'vanity' : usedInvites[0] ? 'normal' : 'unknown', usedInvites[0] ?? null);
    }

    private fetchGuildCache(guild: Guild): Promise<void> {
        return new Promise((resolve) => {
            if (guild.me.hasPermission('MANAGE_GUILD') && this.options.fetchGuilds) {
                guild.fetchInvites().then((invites) => {
                    this.invitesCache.set(guild.id, invites);
                    this.invitesCacheUpdates.set(guild.id, Date.now());
                    resolve();
                }).catch(() => resolve());
            } else resolve();
        });
    }

    private fetchGuildVanityCode(guild: Guild): Promise<void> {
        return new Promise((resolve) => {
            if (this.options.fetchVanity && guild.features.includes('VANITY_URL')) {
                if (guild.vanityURLCode) {
                    this.vanityURLCache.set(guild.id, guild.vanityURLCode);
                    resolve();
                }
                guild.fetchVanityCode().then((code) => {
                    this.vanityURLCache.set(guild.id, code);
                    resolve();
                }).catch(() => resolve());
            } else resolve();
        });
    }

    public async fetchCache() {
        const fetchGuildCachePromises = this.guilds.array().map((guild) => this.fetchGuildCache(guild));
        await Promise.all(fetchGuildCachePromises);
        const fetchGuildVanityCodePromises = this.guilds.array().map((guild) => this.fetchGuildVanityCode(guild));
        await Promise.all(fetchGuildVanityCodePromises);
    }

}

const init = (client: Client, options: InvitesTrackerOptions) => new InvitesTracker(client, options);

export = {
    init
};
