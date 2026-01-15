import cardActions from '@renderer/constants/cardActions'
import { Progress, Skeleton } from 'antd'

interface SkeletonCardProps {
  /**
   * @description `[ENG]` Encrypted item in progress that will be shown in the skeleton card.
   * @description `[ESP]` Elemento en proceso de encriptación que se mostrará en la tarjeta de esqueleto.
   */
  pendingItem?: PendingItem
}

function SkeletonCard(props: SkeletonCardProps) {
  const { pendingItem } = props

  return (
    <div className="skeleton-card relative w-fit">
      {pendingItem && (
        <span className="absolute left-6 top-6 flex flex-col gap-y-0.5">
          <Progress
            className="bg-white"
            status={pendingItem.status === 'error' ? 'exception' : undefined}
            percent={pendingItem.percent}
            type="circle"
            size={40}
          />
        </span>
      )}
      <Skeleton
        className="w-87.5! h-min! bg-white p-6 rounded-t-lg -mb-0.5!"
        paragraph={{ rows: 1 }}
        avatar
        active
      />
      <ul className="inline-flex justify-between rounded-b-lg bg-white w-full text-black/25 divide-x divide-gray-300/35 border-t border-gray-300/35 pb-0.5!">
        {cardActions.map(({ Icon, key }) => (
          <li className="grow my-3! cursor-not-allowed *:justify-center *:w-full" key={key}>
            <Icon />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SkeletonCard
