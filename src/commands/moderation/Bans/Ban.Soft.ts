import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  TextChannel,
  PermissionsBitField,
} from "discord.js";
import CustomClient from "../../../base/classes/CustomClient";
import SubCommand from "../../../base/classes/Subcommand";
import GuildConfig from "../../../base/schemas/GuildConfig";

export default class BanSoft extends SubCommand {
  constructor(client: CustomClient) {
    super(client, {
      name: "ban.soft",
    });
  }

  async Execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.member) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser("target");
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";
    const silent = interaction.options.getBoolean("silent") ?? false;

    const errorEmbed = new EmbedBuilder().setColor("Red");

    if (!target) {
      return interaction.reply({
        embeds: [errorEmbed.setDescription("❌ | User not found.")],
        ephemeral: true,
      });
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({
        embeds: [errorEmbed.setDescription("❌ | You cannot ban yourself.")],
        ephemeral: true,
      });
    }

    const member = interaction.guild?.members.cache.get(target.id);

    if (member) {
      if (
        !(interaction.member.permissions as PermissionsBitField).has(
          PermissionsBitField.Flags.BanMembers
        )
      ) {
        return interaction.reply({
          embeds: [
            errorEmbed.setDescription(
              "❌ | You don't have permission to ban members."
            ),
          ],
          ephemeral: true,
        });
      }

      if (
        member.roles.highest.position >=
        (interaction.member as GuildMember).roles.highest.position
      ) {
        return interaction.reply({
          embeds: [
            errorEmbed.setDescription(
              "❌ | You cannot ban a user with equal or higher rank."
            ),
          ],
          ephemeral: true,
        });
      }

      if (!member.bannable) {
        return interaction.reply({
          embeds: [errorEmbed.setDescription("❌ | I cannot ban this user.")],
          ephemeral: true,
        });
      }
    }

    if (reason.length > 512) {
      return interaction.reply({
        embeds: [
          errorEmbed.setDescription(
            "❌ | The reason cannot be longer than 512 characters."
          ),
        ],
        ephemeral: true,
      });
    }

    // Attempt to DM the user before banning
    try {
      await target.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `
              🔨 | You were soft banned from **${interaction.guild?.name}** by ${interaction.user}
              Reason: ${reason}
              If you would like to appeal, please contact the server moderators.
            `
            )
            .setImage(interaction.guild?.iconURL() ?? null),
        ],
      });
    } catch (dmError) {
      console.log(`Failed to DM user ${target.id} before ban: ${dmError}`);
    }

    // Proceed with the soft ban
    try {
      await interaction.guild?.members.ban(target, {
        reason: reason,
      });

      // Immediately unban the user
      await interaction.guild?.members.unban(target.id);
    } catch (banError) {
      return interaction.reply({
        embeds: [
          errorEmbed.setDescription(
            `❌ | There was an error soft banning this user: ${banError}`
          ),
        ],
        ephemeral: true,
      });
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `🔨 | ${target} - \`${target.id}\` has been soft banned and immediately unbanned.`
          ),
      ],
      ephemeral: true,
    });

    if (!silent) {
      const channel = interaction.channel;
      if (channel && "send" in channel) {
        await channel
          .send({
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setAuthor({ name: `🔨 | Soft Ban - ${target.tag}` })
                .setThumbnail(target.displayAvatarURL({ size: 64 }))
                .setDescription(
                  `
                **Reason:** ${reason}
              `
                )
                .setTimestamp(),
            ],
          })
          .then(async (msg) => await msg.react("🔨"));

        const guild = await GuildConfig.findOne({
          guildId: interaction.guildId,
        });

        if (
          guild?.logs.moderation?.enabled &&
          guild.logs.moderation.channelId
        ) {
          const logChannel = (await interaction.guild?.channels.fetch(
            guild.logs.moderation.channelId
          )) as TextChannel;
          if (logChannel) {
            await logChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor("Red")
                  .setThumbnail(target.displayAvatarURL({ size: 64 }))
                  .setAuthor({ name: `🔨 | Soft Ban` })
                  .setDescription(
                    `
                    **User:** ${target} - \`${target.id}\`
                    **Reason:** \`${reason}\`
                  `
                  )
                  .setTimestamp()
                  .setFooter({
                    text: `Actioned by ${interaction.user.tag} - ${interaction.user.id}`,
                    iconURL: interaction.user.displayAvatarURL({ size: 64 }),
                  }),
              ],
            });
          }
        }
      }
    }
  }
}
