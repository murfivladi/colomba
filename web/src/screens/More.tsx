import { CourierArt } from '../art/Couriers';
import { Postmaster } from '../art/Misc';
import { SeedIcon } from '../components/ui';
import { useT } from '../i18n';
import { useSession } from '../state';

export function More() {
  const { t } = useT();
  const { me } = useSession();
  const items: [string, string, React.ReactNode][] = [
    ['#/notifications', `${t('notif.title')}${me.unreadNotifications ? ` (${me.unreadNotifications})` : ''}`, <CourierArt code="pigeon" size={36} />],
    ['#/catalog', t('catalog.title'), <CourierArt code="owl" size={36} />],
    ['#/album', t('album.title'), <CourierArt code="sailboat" size={36} />],
    ['#/shop', t('shop.title'), <SeedIcon size={30} />],
    ['#/settings', t('settings.title'), <CourierArt code="snail" size={36} />],
    ['#/legal', t('settings.legal'), <CourierArt code="post" size={36} />],
  ];
  if (me.role === 'admin') items.push(['#/admin', t('admin.title'), <Postmaster size={36} />]);
  return (
    <div>
      <div className="card row">
        <span className="semi-badge" style={{ fontSize: '1.2rem' }}>{me.semi} <SeedIcon size={20} /></span>
        <small className="muted grow">{t('semi.hint')}</small>
      </div>
      {items.map(([href, label, icon]) => (
        <a key={href} className="envelope-tile" href={href}>{icon}<span className="grow">{label}</span>›</a>
      ))}
    </div>
  );
}
