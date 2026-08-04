class CompactQueueUI extends CompactChipStripUI {
    // Returns grouped items: consecutive runs of the same action ID are collapsed
    // into one entry with a count. Each entry: { item, id, count, items, queueStartIndex }
    getItems() {
        const activeMyte = this.parent.getActiveMyte?.();
        const isDebug = document.body.classList.contains('debug');
        const rawQueue = activeMyte?.queue?.queue ?? [];
        const grouped = [];
        let queueIdx = 0;
        for (const item of rawQueue) {
            const isHidden = item.constructor?.metadata?.hideFromQueue === true;
            if (!isDebug && isHidden) {
                queueIdx++;
                continue;
            }
            const id = item.constructor?.metadata?.id ?? null;
            const last = grouped[grouped.length - 1];
            if (last && id && last.id === id && last.isHidden === isHidden) {
                last.count++;
                last.items.push(item);
            } else {
                grouped.push({ item, id, count: 1, items: [item], queueStartIndex: queueIdx, isHidden });
            }
            queueIdx++;
        }
        return grouped;
    }

    getQueueTitle(item) {
        return item.getQueueTitle?.() ||
            item.constructor?.metadata?.label ||
            item.constructor?.name?.replace(/Action$/, '') ||
            'Action';
    }

    getQueueDescription(item) {
        return item.getQueueDescription?.() || '';
    }

    // Sprite symbol name from actions.json. Actions without one fall back to the
    // initials produced by getShortLabel.
    getIconName(item) {
        return item.constructor?.metadata?.icon || null;
    }

    getShortLabel(item) {
        const explicit = item.constructor?.metadata?.labelShort;
        if (explicit) {
            return explicit;
        }

        const words = this.getQueueTitle(item)
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean);

        if (words.length === 0) return 'Q';
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    getProgressRatio(item, chipIndex) {
        if (chipIndex !== 0) {
            return null;
        }

        if (typeof item.getProgress === 'function') {
            const p = item.getProgress();
            return p > 0 ? Utility.clamp(p, 0, 1) : null;
        }

        if (!item.duration || item.duration <= 0 || item.currentDuration === -1) {
            return null;
        }

        if (item.currentDuration >= item.duration) {
            return null;
        }

        return Utility.clamp(1 - (item.currentDuration / Math.max(item.duration, 1)), 0, 1);
    }

    getChipConfig(group, chipIndex) {
        const { item, count, isHidden } = group;
        const title = this.getQueueTitle(item);
        const description = this.getQueueDescription(item);
        const progressRatio = this.getProgressRatio(item, chipIndex);
        const progressPercent = progressRatio == null ? null : Math.round(progressRatio * 100);
        const tooltipLines = [];

        if (description) {
            tooltipLines.push(description);
        }

        tooltipLines.push(chipIndex === 0 ? 'Current action' : `Queued #${chipIndex + 1}`);

        if (count > 1) {
            tooltipLines.push(`×${count} queued`);
        }

        if (progressPercent != null) {
            tooltipLines.push(`Progress: ${progressPercent}%`);
        }

        tooltipLines.push('Hold to cancel.');

        return {
            key: `queue-${chipIndex}`,
            item: group,
            index: chipIndex,
            className: `queue-chip ${item.constructor?.metadata?.category || ''} action-${item.constructor?.metadata?.id || 'unknown'}${chipIndex === 0 ? ' is-current' : ''}${isHidden ? ' is-hidden-action' : ''}`,
            label: title,
            icon: this.getIconName(item),
            shortLabel: this.getShortLabel(item),
            badgeText: count > 1 ? String(count) : null,
            progressRatio,
            cancellable: true,
            tooltipTitle: title,
            tooltipLines
        };
    }

    cancelItem(group, chipIndex) {
        const activeMyte = this.parent.getActiveMyte?.();
        if (!activeMyte?.queue) {
            return false;
        }

        if (chipIndex === 0) {
            activeMyte.queue.removeCurrentAction?.();
            return true;
        }

        // Remove all items in the group from the queue by reference
        if (Array.isArray(activeMyte.queue.queue)) {
            for (const groupItem of group.items) {
                const idx = activeMyte.queue.queue.indexOf(groupItem);
                if (idx !== -1) {
                    activeMyte.queue.queue.splice(idx, 1);
                }
            }
            return true;
        }

        return false;
    }
}
