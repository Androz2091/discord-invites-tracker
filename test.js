require('dotenv').config();

const Discord = require('discord.js');
const client = new Discord.Client();

const InvitesTracker = require('./');
const tracker = InvitesTracker.init(client, {
    fetchGuilds: true,
    fetchVanity: true,
    fetchAuditLogs: true
});

tracker.on('cacheFetched', () => {
    console.log('Cache fetched');
});

tracker.on('guildMemberAdd', (member, type, invite) => {

    console.log(member, invite, type)

    // if no invite was found
    if (!invite) return;

    member.guild.channels.cache.get('755313111074078725').send(`**${member.user.tag}** joined using **${invite.code}**`);

    /*
        // send welcome message
        const welcomeChannel = member.guild.channels.cache.find((ch) => ch.name === 'welcome');
        welcomeChannel.send(`Welcome ${member}! You were invited by ${invite.inviter.username}!`);
    */

    console.log(member, invite, type)
});

client.login(process.env.TOKEN);
