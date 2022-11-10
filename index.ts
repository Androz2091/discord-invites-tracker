import { EventEmitter } from 'events';
import type {
    Client, Snowflake, Guild, GuildMember, Invite, User
} from 'discord.js';
import {
    Collection, GuildFeature, PermissionFlagsBits
} from 'discord.js';

type JoinType = 'permissions' | 'normal' | 'vanity' | 'unknown';

declare interface InvitesTracker {
    on(event: 'cacheFetched', listener: () => void): this;
    on(event: 'guildMemberAdd', listener: (member: GuildMember, joinType: JoinType, usedInvite: InviteData | null) => void): this;
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

interface InviteData {
    guildId: Snowflake;
    code: string;
    url: string;
    uses: number|null;
    maxUses: number|null;
    maxAge: number|null;
    createdTimestamp: number|null;
    inviter: User|null;
}

interface VanityInviteData {
    code: string|null;
    uses: number|null;
}

interface DeletedInviteData extends InviteData {
    deleted?: boolean;
    deletedTimestamp?: number;
};

type TrackedInviteData = DeletedInviteData & InviteData;

/**
 * Compare le cache et les données en direct pour trouver quelle invitation a été utilisée.
 * @param cachedInvites Les invitations en cache du serveur. Celles-ci sont forcément bonnes et correspondent exactement à l'état des invitations juste avant l'arrivée du membre.
 * @param currentInvites Les invitations du serveur. Celles-ci sont les invitations qui sont actuellement sur le serveur.
 * @returns Les invitations qui pourraient convenir, classées de la plus probable à la moins probable.
 */
const compareInvitesCache = (cachedInvites: Collection<string, TrackedInviteData>, currentInvites: Collection<string, TrackedInviteData>): TrackedInviteData[] => {
    const invitesUsed: InviteData[] = [];
    currentInvites.forEach((invite) => {
        if (
            // L'invitation doit forcément avoir été utilisée une fois
            invite.uses !== 0
            // L'invitation doit être dans le cache (sinon impossible de comparer les utilisations)
            && cachedInvites.get(invite.code)
            // L'invitation doit avoir été utilisée au moins une fois
            && cachedInvites.get(invite.code)!.uses! < invite.uses!
        ) {
            invitesUsed.push(invite);
        }
    });
    // Cas de figure particulier : l'invitation utilisée a été supprimée juste après l'arrivée du membre et juste
    // avant l'émission de GUILD_MEMBER_ADD. (une invitation avec un nombre d'utilisation limitée fonctionne comme ça)
    if (invitesUsed.length < 1) {
        // Triage du cache pour que les invitations supprimées le plus récemment soient en premier
        // (logiquement une invitation supprimée il y a 0.01s a plus de chance d'être une invitation que le membre a utilisé qu'une invitation supprimée il y a 3 jours)
        cachedInvites.sort((a, b) => (a.deletedTimestamp && b.deletedTimestamp) ? b.deletedTimestamp - a.deletedTimestamp : 0).forEach((invite) => {
            if (
                // Si l'invitation n'est plus présente
                !currentInvites.get(invite.code)
                // Si l'invitation était bien une invitation a un nombre d'utilisation limitée
                && invite.maxUses! > 0
                // Et si l'invitation était sur le point d'atteindre le nombre d'utilisations max
                && invite.uses === (invite.maxUses! - 1)
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

    public invitesCache: Collection<Snowflake, Collection<string, TrackedInviteData>>;
    public vanityInvitesCache: Collection<Snowflake, VanityInviteData>;
    public invitesCacheUpdates: Collection<Snowflake, number>;
    public cacheFetched: boolean;


    constructor(client: Client, options: InvitesTrackerOptions) {
        super();
        this.client = client;
        this.options = options;

        this.invitesCache = new Collection();
        this.invitesCacheUpdates = new Collection();
        this.cacheFetched = false;

        this.vanityInvitesCache = new Collection();

        if (this.options.fetchGuilds) {
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
        }

        this.client.on('guildMemberAdd', (member) => this.handleGuildMemberAdd(member as GuildMember));
        this.client.on('inviteCreate', (invite) => this.handleInviteCreate(invite));
        this.client.on('inviteDelete', (invite) => this.handleInviteDelete(invite));
    }

    get guilds(): Collection<Snowflake, Guild> {
        let guilds = this.client.guilds.cache;
        if (this.options.exemptGuild) guilds = guilds.filter((g) => !this.options.exemptGuild!(g));
        if (this.options.activeGuilds) guilds = guilds.filter((g) => this.options.activeGuilds!.includes(g.id));
        return guilds;
    }

    static mapInviteData(invite: Invite): TrackedInviteData {
        return {
            guildId: invite.guild!.id,
            code: invite.code,
            url: invite.url,
            uses: invite.uses,
            maxUses: invite.maxUses,
            maxAge: invite.maxAge,
            createdTimestamp: invite.createdTimestamp,
            inviter: invite.inviter
        };
    }

    private async handleInviteCreate (invite: Invite): Promise<void> {
        // Vérifier que le cache pour ce serveur existe bien
        if(this.options.fetchGuilds) await this.fetchGuildCache(invite.guild as Guild, true);
        // Ensuite, ajouter l'invitation au cache du serveur
        if (this.invitesCache.get(invite.guild!.id)) {
            this.invitesCache.get(invite.guild!.id)!.set(invite.code, InvitesTracker.mapInviteData(invite));
        }
    }

    private async handleInviteDelete (invite: Invite): Promise<void> {
        // Récupère le cache du serveur
        const cachedInvites = this.invitesCache.get(invite.guild!.id);
        // Si le cache pour ce serveur existe et si l'invitation existe bien dans le cache de ce serveur
        if(cachedInvites && cachedInvites.get(invite.code)) {
            cachedInvites.get(invite.code)!.deletedTimestamp = Date.now();
        }
    }

    /**
     * Emit quand un membre rejoint un serveur.
     * @param member Le membre qui a rejoint.
     */
    private async handleGuildMemberAdd(member: GuildMember): Promise<void> {
        if (member.partial) return;
        if (!this.guilds.has(member.guild.id)) return;

        // Récupération des nouvelles invitations
        const currentInvites = await member.guild.invites.fetch().catch(() => new Collection()) as Collection<string, Invite>;
        const currentInvitesData = new Collection<string, TrackedInviteData>();
        currentInvites.forEach((invite) => {
            currentInvitesData.set(invite.code, InvitesTracker.mapInviteData(invite));
        });
        if (!currentInvites) {
            // Si les invitations n'ont pas pu être récupérées
            this.emit('guildMemberAdd', member, 'permissions', null);
            return;
        }
        // Récupération des invitations en cache
        const cachedInvites = this.invitesCache.get(member.guild.id);
        // Mise à jour du cache
        this.invitesCache.set(member.guild.id, currentInvitesData);
        this.invitesCacheUpdates.set(member.guild.id, Date.now());
        // Si il n'y avait pas de données en cache, on ne peut tout simplement pas déterminer l'invitation utilisée
        if (!cachedInvites) {
            this.emit('guildMemberAdd', member, 'unknown', null);
            return;
        }

        // Ensuite, on compare le cache et les données actuelles (voir commentaires de la fonction)
        let usedInvites = compareInvitesCache(cachedInvites, currentInvitesData);

        // L'invitation peut aussi être une invitation vanity (https://discord.gg/invitation-personnalisee)
        let isVanity = false;
        if (usedInvites.length === 0 && member.guild.features.includes(GuildFeature.VanityURL)) {
            // On récupère l'invitation vanity
            const vanityInvite = await member.guild.fetchVanityData();
            // On récupère le cache
            const vanityInviteCache = this.vanityInvitesCache.get(member.guild.id);
            // On met à jour le cache
            this.vanityInvitesCache.set(member.guild.id, vanityInvite);
            if (vanityInviteCache) {
                // Si le nombre d'utilisation a augmenté
                if (vanityInviteCache.uses! < vanityInvite.uses!) isVanity = true;
            }
        }

        this.emit('guildMemberAdd', member, isVanity ? 'vanity' : usedInvites[0] ? 'normal' : 'unknown', usedInvites[0] ?? null);
    }

    private fetchGuildCache(guild: Guild, useCache: boolean = false): Promise<void> {
        return new Promise((resolve) => {
            guild.fetch().then(() => {
                guild.members.me!.fetch().then(() => {
                    if (this.invitesCache.has(guild.id) && useCache) return resolve();
                    if (guild.members.me!.permissions.has(PermissionFlagsBits.ManageGuild)) {
                        guild.invites.fetch().then((invites) => {
                            const invitesData = new Collection<string, TrackedInviteData>();
                            invites.forEach((invite) => {
                                invitesData.set(invite.code, InvitesTracker.mapInviteData(invite));
                            });
                            this.invitesCache.set(guild.id, invitesData);
                            this.invitesCacheUpdates.set(guild.id, Date.now());
                            if (guild.features.includes(GuildFeature.VanityURL) && this.options.fetchVanity) {
                                guild.fetchVanityData().then((vanityInvite) => {
                                    this.vanityInvitesCache.set(guild.id, vanityInvite);
                                    resolve();
                                });
                            } else resolve();
                        }).catch(() => resolve());
                    } else resolve();
                });
            }).catch(() => resolve());
        });
    }

    public async fetchCache() {
        const fetchGuildCachePromises = this.client.guilds.cache.map(guild => this.fetchGuildCache(guild));
        await Promise.all(fetchGuildCachePromises);
    }

}

const init = (client: Client, options: InvitesTrackerOptions) => new InvitesTracker(client, options);

export = {
    init
};
